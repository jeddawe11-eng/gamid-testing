# GamID — Authoritative Technical Continuation Handoff

> **Current product state and approved product contracts: [`gamid-truth.json`](gamid-truth.json).** It is authoritative over older status lines in this document. Agent rules: [`AGENTS.md`](AGENTS.md).

Last updated: 2026-10-07

Repository: `jeddawe11-eng/gamid-testing`

Branch: `feature/play-together-notifications`

Current product checkpoint: `6e2cbdae9d61f106de806f2d42b99c8209299867`, Intro boundary tolerance, manual acceptance pending. Cloudflare migration remains ACCEPTED and Pages retired. Current continuation: section 18 and `PROJECT_STATE.md`. Older hosting and checkpoint descriptions below are historical; current canonical frontend is Cloudflare.

Historical September 18 continuation summary: Authoritative implementation checkpoint: see section 16 for the exact current commit. A verified Opera-vs-Chrome public-Intro reliability fix (retry/ack handshake + deterministic asset versioning) is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7g. The Permanent Public GamID URL + QR + Sharing slice is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7f. Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) is implemented and TESTING-validated but **not yet formally accepted by Mazen** — see section 7d. A mobile-Publish-button manual-acceptance bug found during Mazen's acceptance testing has since been fixed — see section 7e. It is applied on top of Slice 1/2 (Foundation + Public-Safe Data, section 7b, also not yet formally accepted), the accepted Split Reveal Intro-visibility fix (section 7a), and the Slice 3C implementation checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

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
| League of Legends prototype (manual Riot ID + temporary OP.GG adapter) | **ACCEPTED AS PROTOTYPE ONLY by Mazen 2026-10-16; PRIVATE / UNVERIFIED; no official Riot authentication/verification; §69** | Implementation `44c7a4455f40088572d165a6de453b73491d6500`; see section 7j |
| Root landing page V1 (replaces the public NovaRift prototype at the TESTING root) | **ACCEPTED by Mazen after personal TESTING testing, 2026-10-16; §70** | Implementation `3cb0cde7f474cbe7efd194623c6c02853c3de365`; see section 7k |
| Public Profile Expansion — Phase 1 (per-section visibility + public-safe data foundation) | **IMPLEMENTED AND ACCEPTED** (Mazen accepted it, stated at the start of the Steam Connection Foundation task) | Implementation `2e0c433eb37458e943dbdd1d3f0d259105ba46a7`, docs `50737ba408d9ab1c3894d4713efa5df5b3743f17`; see section 7l |
| Steam Connection Foundation (Steam OpenID 2.0 as a Gaming Connection) | **IMPLEMENTED AND ACCEPTED** (Mazen completed the real Steam OpenID sign-in successfully) | Implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`, docs `c46a00d162b58f86ac0a4d172beca56dd95a0cd7`; see section 7m |
| Steam My Games (owner-triggered game discovery via the official Steam Web API; private, discovery only) | **ACCEPTED BY MAZEN — real TESTING library discovery/My Games check 2026-10-16; §69** | Implementation `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`; see section 7n |
| My Duo V1 + GamID Notifications foundation | **IMPLEMENTED AND ACCEPTED** (Mazen's manual acceptance, 2026-10-02) | Accepted checkpoint `237903a15e0e3ba13f203f929c8256b2cf484719` (branch `feature/my-duo-v1`), landed on `main` by fast-forward from `f609e76`; see section "My Duo + Notifications acceptance" below |
| Post-3C phases | **APPROVED DIRECTION / IDEA ONLY** | See `GAMID_ROADMAP.md`; none is authorized to start |

### My Duo + Notifications acceptance (2026-10-02)

Accepted checkpoint `237903a15e0e3ba13f203f929c8256b2cf484719` (tree `fc9c341237209d7b60b538920c32e6a931c4d8d6`), TESTING only. Migrations (applied to TESTING, recorded in the migration history): `20261002150000_my_duo`, `20261002170000_my_duo_realtime`, `20261002190000_my_duo_notifications`, `20261002210000_gamid_notifications`.

Manually accepted by Mazen: My Duo search and request; mutual consent; realtime request/state updates without refresh; accept / decline / cancel / end; one Duo maximum; replacement rules; independent public visibility control; public My Duo presentation; navigation from one GamID to the Duo's GamID; Back to the previous GamID; Skip Intro during Duo navigation; normal Intro completion; Replay Intro preserved; offline durable notifications; live notifications; notification bell; unread count; individual Mark read; Mark all as read; read notifications remain in history; offline notifications do not replay as old toasts; 5-second live toast; mobile / public navigation layout.

**Not manually tested:** the third-account replacement path (a GamID with a Duo accepting / being accepted by a third GamID, which ends the previous Duo and notifies it with `duo.replaced`) - only two test accounts were available. Its automated and database coverage passed (`tests/integration/my-duo-db.sql`, `tests/integration/notifications-db.sql`, `tests/my-duo.test.js`).

Mazen intentionally deferred further Slice 3C manual testing and fixes. Do not resume them automatically and do not infer acceptance from technical completion.

## 4. Repository and frontend baseline

- GitHub: `https://github.com/jeddawe11-eng/gamid-testing`
- Branch: `main`
- Implementation checkpoint: `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43` plus the accepted Split Reveal Intro-visibility fix; see section 7a)
- Node.js: 20 or newer.
- Frontend: dependency-free static HTML, CSS, and native ES modules under `dist/`.
- Validation: `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`, and `git diff --check`.
- Canonical TESTING root: `https://gamid-testing-static.gamid.workers.dev/` — the static landing page. Historical Pages deployment records remain below.
- Canonical TESTING owner/editor: `https://gamid-testing-static.gamid.workers.dev/account/`
- Current deployment: `.github/workflows/deploy-cloudflare-testing.yml`, exact-ref/SHA guarded. Legacy Pages workflow remains enabled pending separately authorized retirement; do not use it for current deployments.
- Canonical frontend uses root-relative routes. Generic historical base-path compatibility remains; no Cloudflare flow needs the Pages origin.

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

**ACCEPTED by Mazen after personal TESTING testing on 2026-10-16.** See section 7k, §70 and REV-0008.

### Public Profile Expansion — Phase 1 (visibility + public-safe data)

**IMPLEMENTED AND ACCEPTED.** See section 7l.

### Steam Connection Foundation

**IMPLEMENTED AND ACCEPTED** (real Steam OpenID sign-in completed by Mazen). See section 7m.

### Steam My Games

**ACCEPTED by Mazen after his real TESTING library check on 2026-10-16.** Two games, including Marvel Rivals, were discovered and both appeared in My Games. Older missing-key/setup blockers are superseded by that functional result; no secrets inspected. See §7n, §69 and REV-0001 item 5.

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

**ACCEPTED AS PROTOTYPE ONLY by Mazen 2026-10-16 (§69; REV-0001 item 6). PRIVATE, UNVERIFIED, TEMPORARY UNOFFICIAL OP.GG; no official Riot authentication/verification and no successful real-account manual test claimed.** Implementation checkpoint `44c7a4455f40088572d165a6de453b73491d6500` (built on `3a5ce6c82bb3a6d33001054a14eae1991b2c10eb`). Direction change that led here: Mazen's real Discord `identify + connections` authorization returned **0 linked accounts** (section 7i), so Riot cannot be discovered through Discord and that route was dropped. This slice instead lets the owner type their Riot ID **once**, and resolves public League details through an isolated, temporary OP.GG adapter. It does **not** implement Riot RSO, call any Riot API, use the Riot development key, look up other players, or make anything public, and it does not change Discord, the Discord connection, or the Discord discovery result.

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

**ACCEPTED by Mazen after personal manual TESTING testing on 2026-10-16 (§70; REV-0008).** Implementation checkpoint `3cb0cde7f474cbe7efd194623c6c02853c3de365` (built on `bba30a382bbc69666b7c5925762401be9a94f284`). A focused product/UX correction: no authentication, RLS, Discord, League/OP.GG, Intro, public-route, or `@black` change.

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

**ACCEPTED by Mazen 2026-10-16 after real connected-account library discovery: two games, including Marvel Rivals, both appeared in My Games (§69; REV-0001 item 5). The earlier missing-key blocker is superseded by this reported functional success; no secret values or configuration were inspected.** Implementation checkpoint `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`, built on the Steam Connection Foundation documentation checkpoint `c46a00d162b58f86ac0a4d172beca56dd95a0cd7` (Mazen has since completed the real Steam OpenID flow successfully — the connection is intact and was never touched by this slice).

**Discovery only.** For the already-connected Steam account, an explicit button asks Steam which games that account can share, and GamID stores a normalized list labelled `DISCOVERED_FROM_STEAM`. It proves nothing about any in-game profile, character, UID, rank, or stats. Marvel Rivals (Steam App ID `2767030`) is only *recognized* and shown as "Discovered via Steam". Not started: Marvel API/stats/UID/verification, third-party sources (Tracker, OP.GG, …), the Game ID Wall / Profile Canvas, any Public Profile change, any other provider or game, background/scheduled refresh.

### Official source and requirements (checked against Valve's own pages)

- Endpoint: `GET https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/` with `key`, `steamid`, `include_appinfo=true` (name + icon), `include_played_free_games=true` (free games the account has played are excluded by default — this matters for free-to-play titles such as Marvel Rivals) and `format=json`. Nothing is scraped; no other Steam endpoint is used.
- **A Web API key is mandatory**: a live, non-credentialed probe of every host/version answers `401 Unauthorized … verify your key= parameter`. Keys are registered at `https://steamcommunity.com/dev/apikey`. Steam API Terms of Use (`https://steamcommunity.com/dev/apiterms`): keep the key confidential and never share it; 100,000 calls per day; retrieve a user's Steam data only as the user requests it and tell the user what is stored (the UI does; the throttle is far below the limit).
- Valve does not document the private-library response. GamID relies on the documented shape (`response.game_count`, `response.games[]`) and treats the commonly observed empty `response` object as "not shared" — see the state table. Anything unexpected becomes MALFORMED or SERVICE_ERROR, never "no games".

### The API key (server-side only)

Read only inside `supabase/functions/_shared/steam-games.js` from the Edge Function environment (`STEAM_WEB_API_KEY`), validated as 32 hex characters, sent only to `api.steampowered.com`, never returned, logged, stored, or included in an error (tests assert this on success and every failure path; a test also scans the repo so the name appears in exactly one source file and no key literal exists). **A missing or malformed key is a safe "not configured" state** that is detected *before* anything is reserved, so it consumes no throttle. Same secret pattern as Discord (`DISCORD_CLIENT_SECRET`): set outside the repo on the TESTING project.

**Historical setup instructions (not an outstanding acceptance prerequisite; superseded by the 2026-10-16 successful real check):** (1) signed in to Steam, open `https://steamcommunity.com/dev/apikey`, enter a domain name (for TESTING use `jeddawe11-eng.github.io`), accept the Steam Web API Terms, register, and copy the 32-character key (Steam may refuse to issue a key for a *limited* Steam account — if it says so, that is Steam's rule, not GamID's); (2) add it as an Edge Function secret on the TESTING project only: Supabase Dashboard → project `upvtrczefcvigxdyuylw` → Edge Functions → Secrets → name `STEAM_WEB_API_KEY`, or in a terminal `supabase secrets set STEAM_WEB_API_KEY=<the key> --project-ref upvtrczefcvigxdyuylw`. No redeploy is needed; give it a minute. Do not paste the key into chat, a file, or a commit.

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

Migration applied with `supabase db push` (dry run listed only it; project `upvtrczefcvigxdyuylw`). `steam-games-refresh` v1 (`verify_jwt=true`, pinned in `supabase/config.toml`) deployed with `supabase functions deploy … --use-api`; Discord v3/v3, League v2, Steam OpenID v1/v1 unchanged. GitHub Pages deploy succeeded and serves the new code. No Production resource was touched. **Secret `STEAM_WEB_API_KEY` is not set (manual step above).** **Historical deployment-time configuration note only; superseded as a current blocker by Mazen's successful 2026-10-16 real-library check (§69). No secrets accessed for that reconciliation.**

### Known limitations / deferred

- Historical setup blocker, now superseded: Mazen's 2026-10-16 real-library discovery succeeded and is ACCEPTED (§69). The missing/malformed-key response remains a valid generic error path, not the current acceptance state.
- The private-library response is not officially documented; the classification is conservative, and the real behavior will be observed during acceptance.
- Steam privacy also controls playtime ("Always keep my total playtime private…"): playtime can be absent even when games are listed.
- The recognition map holds one entry (Marvel Rivals). Deferred and unstarted: the generic Games/Game-ID model that would consume `discovered_games`, any Marvel account/UID/rank/stats or verification, public display of games, Game ID Wall / Profile Canvas.

### Manual acceptance (Mazen)

**Original manual test procedure (historical; final owner-reported acceptance outcome is in §69):** After setting the key: YOUR GAMID → Steam → **My Games** → **Load My Games** → your real games appear (or the explained privacy message) → check whether **Marvel Rivals** appears as "Discovered via Steam". Nothing about the connection, Discord, League, or `@black` changes; there is no public display.

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

Migration applied with `supabase db push` (dry run listed only it; project `upvtrczefcvigxdyuylw`). Static files deployed by GitHub Pages. No Edge Function, no secret and no Production resource touched. `STEAM_WEB_API_KEY` is still not set (Steam My Games cannot be fully real-data accepted until that manual step). **Historical deployment-time configuration note only; superseded as a current blocker by Mazen's successful 2026-10-16 real-library check (§69). No secrets accessed for that reconciliation.**

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

**Final acceptance:** Mazen personally tested and explicitly approved the implemented Canonical Game Catalog and manual add/edit/remove on TESTING 2026-10-16. Truth game-catalog-manual-games is ACCEPTED, preserving checkpoint `b4a93b5d9f0b948c3d706e5fc2cbef665c74e63e` and existing limits/contracts. See §70 and REV-0008.

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

**Final acceptance:** Mazen personally tested and explicitly approved the implemented Canonical Game Catalog and manual add/edit/remove on TESTING 2026-10-16. Truth game-catalog-manual-games is ACCEPTED, preserving checkpoint `b4a93b5d9f0b948c3d706e5fc2cbef665c74e63e` and existing limits/contracts. See §70 and REV-0008.

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
| Game Catalog completeness (27,182 games, 102 platforms, 95.65 % with a release year; source Wikidata) | **ACCEPTED by Mazen after personal TESTING testing, 2026-10-16 (§70; REV-0008)** | Notable games only (at least 2 Wikipedia editions); games with fewer editions, 1,182 games without a source date and 365 unmapped platform values are not covered (fail safe). Extend with the resumable exporter + loader (sections 7t, 7u); better platform data would need IGDB (a key Mazen would create). No typo tolerance. |
| Manual game add / edit / remove in My Games (canonical catalog, multi-platform, MANUAL only) | **ACCEPTED by Mazen after personal TESTING testing, 2026-10-16 (§70; REV-0008)** | See section 7t. The library moved out of the Steam card into one provider-neutral My Games region. Xbox / PlayStation / Discord discovery, Marvel stats and W1 not started. |
| Wall Editor → Assets: a video asset whose first frame is transparent or blank looked like an empty dark box (the list showed a paused `<video>` at frame 0) | **FIXED AND ACCEPTED** (Mazen, TESTING, 2026-10-05; accepted product checkpoint `c9327818b1e5ac1c42e057c268bdcde56d4f49c2` on `feature/wall-video-asset-preview`, deploy run `37321028462`) | `dist/wall-editor/video-preview.js` shows one representative still frame per video asset in Assets and in the background video list. Frames are sampled at fixed points and scored locally, with a "▶ Video" fallback. Nothing autoplays and nothing is stored; there is no storage, quota or schema change. Accepted: the preview is recognisable, Add places and plays the video, and the preview survives a refresh (no Save or Publish performed). Found by the Monitor's Wall Assets action-coverage pilot. **Not yet on `main`.** |
| Play Together produced no GamID notifications at all: no Play Together notification type and no producer call existed, so the bell, unread count and log never changed for any Play Together event | **FIXED AND ACCEPTED** (Mazen, TESTING, 2026-10-06; accepted product checkpoint `e97594c52d5d341da40fd578c63404ec3b305475` on `feature/play-together-notifications`; migration `20261006090000_play_together_notifications` applied; deploy run `37399175820`) | Implements exactly the three approved contracts: join request → host; approve and reject → requester (applicant-originated requests only). Host invitations stay without notifications, since no contract covers them. Accepted: join request → host bell, reject → requester bell, second request + approve → requester bell, and the same state and count across authenticated pages. **Not yet on `main`.** It also explains the Monitor's open V2 Play Together consequence findings (GM-0144 … GM-0164), which a later Monitor run should re-check. |
| Global authenticated shell: notifications across authenticated GamID surfaces | **ACCEPTED BY MAZEN** (manual TESTING acceptance complete, 2026-10-06) | PASS: notification bell on owned Crew page; mobile Wall Editor bell does not obstruct editor controls; sign-out removes the bell; public `/@handle` has no notification bell. Together with the previously accepted Play Together notifications and shared state/count across authenticated pages, all remaining shell acceptance checks are complete. Shell implementation checkpoint `afef865a8868d5677f51b521d2c8f2e0e6a9048d`; accepted Play Together producer `e97594c52d5d341da40fd578c63404ec3b305475`; current deployed product checkpoint `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7`. Truth now marks authenticated-shell ACCEPTED. |
| Global Usage manual acceptance (docs/global-usage-center.md, checklist) | **PARTIAL PASS; capability still PENDING_ACCEPTANCE** | PASS (Mazen): core accounting. Adding a video took Usage from 7.9 MB to 12.3 MB, Assets 2→3, Videos 1→2; deleting it returned 7.9 MB, Assets 2, Videos 1. **Still to verify:** Usage beside the bell on all four authenticated surfaces at desktop and mobile widths; Intro and converted-video source/derivative accounting; refusal of an over-200 MB upload; sign-out / public pages show no Usage. |
| Play Together: Marvel Rivals Quick Match | **ACCEPTED BY MAZEN** (manual TESTING acceptance complete, 2026-10-06) | PASS: Quick Match works; Seats Wanted 1–5 works; Play Now create / cancel works; Competitive is visible but disabled; all 10 official servers are present. All remaining Marvel Rivals acceptance checks are complete. Implementation checkpoint `02a2877b3cf5207a6d5a052bfafe7b5bfa53df82`; current deployed product checkpoint `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7`. Truth now marks play-together-marvel-rivals ACCEPTED. |
| My Crew Account navigation: Open / Preview Crew Wall opened a new tab and had no owner return action | **FIXED AND ACCEPTED BY MAZEN** (manual TESTING acceptance, 2026-10-06; product checkpoint `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7`, TESTING run `37407094550`) | Manual acceptance PASS: Account → My Crew / Open Crew Wall stays in the same tab; “← Back to Profile” returns correctly to Account/Profile in the same tab; member flow works; authenticated notification bell remains available. Account owner and member links now use the same tab. Signed-in Crew visitors get “← Back to Profile” → `/account/`; anonymous visitors keep the existing public return navigation. 41 focused Crew / navigation / shell regressions, lint and typecheck pass. Deployment validation: 1,603 tests, 1,602 passed, zero failed. Live Account → Crew → Back to Profile verified in the same tab; bell retained the same unread count, and all five changed application files match the deployed content exactly. No database, notifications or Usage change. |
| Play Together timing: Scheduled-only "Start within 3 hours" field visible in Play Now | **FIXED AND ACCEPTED BY MAZEN** (manual TESTING acceptance, 2026-10-06; accepted product checkpoint `7cbabf08cb43ead23f178c78bfce6b4ebaa5461d`, TESTING run `37409272787`) | Manual acceptance PASS: Play Now hides "Start within 3 hours"; Scheduled shows and enables it; switching back to Play Now hides it and clears the stale scheduled state; switching back to Scheduled works; Play Now creation works; Scheduled creation works; the existing ≤3-hour restriction remains enforced. **Not yet on `main`.** Root cause: shared `account.css` `label{display:block}` overrode native `[hidden]` rendering. Play Together now enforces `[hidden]` inside its own shell; the shared timing control hides/disables/clears the date for Play Now and enables it for Scheduled. Submission explicitly excludes dates for Play Now. Existing future / ≤3-hour rules remain unchanged for every game. 19 focused tests passed; full deployment validation: 1,608 tests, 1,607 passed, one skipped, zero failed; lint and typechecks passed. Live form verification for League and Marvel: Play Now label has computed display none, input disabled and empty; Scheduled shows an enabled date input; switching back clears the date and switching to Scheduled again leaves it empty. No session submitted or real user data changed. Served modules match the product commit exactly, HTML stamped 7cbabf0. No backend, catalog, Notifications, Usage or Crew change. |
| Egress F4: fresh signed URLs for every public Wall-video page load | **ACCEPTED AS IMPLEMENTATION BASELINE BY MAZEN** (F3 authorization, 2026-10-06; no new real-device playback evidence asserted) | Product checkpoint `2ccb0f8aeec701bd4c0e6006c36d4c628a9ec091`; TESTING run `37457286798`, Worker version `7071cc10-80e7-4aa6-96cf-c565166f741a`. Anonymous published-video capabilities reuse tab-scoped sessionStorage only after the current public publication manifest is fetched; exact project/bucket/path keys, concurrent signing coalescing, unchanged six-hour lifetime, actual token expiry and 30-minute margin. Owner/editor signing, RLS, private buckets and media playback remain unchanged. 77 focused tests PASS (seven new F4 tests); deployment validation: 1,615 tests, 1,614 PASS, one skipped, zero failed; lint/typechecks PASS. Bounded TESTING probe: two old signing requests yielded different URLs, one cached request yielded the same URL across revisit; 65,536 bytes on each HTTP 206 probe, CF MISS then HIT. Browser fixture reload: zero new sign requests, same URL, zero video bytes. Both served modules match the product commit and public HTML is stamped 2ccb0f8. No full-video byte-savings or real-device playback acceptance claimed. Manual check: visit a published video Wall, reload/revisit within the reuse window in the same tab, verify normal playback and unchanged video URL; near-expiry re-signing is covered by deterministic tests. No user/Wall data changed; no Monitor changes, Production access, main merge, quota acceptance test or F2/F3/F5/F6/F7/F8 implementation. Details: `docs/WALL-VIDEO-URL-REUSE-F4.md`. GamID Truth: NO CHANGE REQUIRED. |
| Egress F3: offscreen published Wall videos started streaming immediately | **FIXED AND MANUALLY ACCEPTED BY MAZEN** (2026-10-06) | Product `3b9d8b1c27fb0c9b3fa6fd0c2ee682dab7618906`; run `37459488763`; Worker version `5aceda43-f998-4935-a629-01d3c1f3001e`. Visitor pools opt into one clipped IntersectionObserver (320px vertical margin, threshold 0); no src/preload/autoplay before eligibility, pause outside the margin while retaining source/node/time, resume on return, guard hidden tab/Replay Intro and late canplay. Whole-Wall copies share their active clock without repeated seek feedback. Owner canvas/Preview, images, embeds, F4 and private-media authorization unchanged. Nine F3 regressions; 92 focused tests PASS. Complete workflow: 1,624 tests, 1,623 PASS, one skipped, zero failures; lint/typechecks PASS. Bounded unchanged published TESTING snapshot: initial requests 9 -> 5, bytes 3,039,536 -> 1,049,684; controlled scroll +2 requests/+941,276 bytes; final-stage videos remained unloaded; scroll-back +0 requests/+0 bytes; reload +0 signing requests. Reload +4 successful payload requests/+525,396 bytes is censored by the cumulative 512 KiB/object measurement ceiling; no production reload/full-video savings claimed. Native tiny Whole-Wall fixture verified clipping, pause/resume, frame readiness and clock behavior without Supabase bytes. All three changed served modules match the product commit, F4 cache module unchanged/matches, HTML stamp 3b9d8b1. Details, measurement limits and exact manual checks: `docs/WALL-VIDEO-VIEWPORT-F3.md`. Manual acceptance PASS (Mazen): mobile published Wall scrolling is normal with no visible blank/black flash; scrolling away and back resumes normally; same-tab reload is normal. Mazen explicitly accepted F3. F3 manual acceptance is complete. At the F3 stop, F2 was a recommendation only; the subsequently authorized F2 implementation is recorded separately below. No user/Wall data, database, quota, Monitor, Production or main changes. GamID Truth: NO CHANGE REQUIRED. |
| F2 Intro derivative optimization | **IMPLEMENTED AND MANUALLY ACCEPTED BY MAZEN** (2026-10-07) | Product `04877c20d213f0105fbdc2871146248194eaf773`; deployed Cloudflare run `37479877416`; final TESTING worker build `4f192727-f667-41fc-9693-5d52fc7c9549`, image `sha256:916d37969a2708673ea88ba672733dedff3241843825a589993b69e1de017498`; existing synthetic execution `gamid-intro-worker-testing-ll6kc` succeeded, deployed FFmpeg 5.1.9 and module hashes verified. D3 downscales within long edge 1920 / short edge 1080, preserves aspect/orientation/FPS/timing/audio, no crop/pad/upscale; existing opaque VP9/WebM CRF40/Opus settings remain. 49 native-inclusive focused checks PASS; 68 directly affected staging checks PASS; final deployment build: 1,636 tests, 1,634 PASS, two codec-dependent skips, zero failures; lint/typechecks PASS. No user media reprocessed, no source retention/security/quota/database change. **Manual PASS (Mazen): Landscape, Portrait and Small TESTING Intro fixtures; quality, playback, shape, reveal/replay and expected audio behavior accepted.** Fixture and full evidence in `docs/INTRO-DERIVATIVE-F2.md`. Truth records intro-derivative-f2 as ACCEPTED at the product checkpoint; broader intro-identity remains PENDING_ACCEPTANCE under its separately deferred acceptance. STOP; F5/F6/F7/F8 not implemented. |
| F5 native Intro delivery | **IMPLEMENTED AND MANUALLY ACCEPTED BY MAZEN** (2026-10-07) | Product 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59; TESTING run 37563242127 SUCCESS. Local build 1,650 tests / 1,649 PASS / one skip / zero failures; lint/typechecks PASS. Live fixture and staged module/version checks PASS. Mazen authorized the maximum 120-second signed capability window. Memory-only owner/public leases, fresh current state before playback/replay, lazy owner Preview, native Range delivery and release of main/Split consumers on termination. F2/F3/F4 preserved. Dedicated synthetic acceptance route: /prototypes/intro-derivative-f2/?delivery=f5. Full security/lifecycle, fixture measurement and deployment evidence: docs/INTRO-STREAMING-F5.md. No user media, worker, RLS/buckets/metadata, database, Monitor, Production or main changes. **Manual acceptance PASS (Mazen): TESTING Intro streaming behavior passed manual acceptance; Mazen explicitly ACCEPTED F5.** Truth records intro-streaming-f5 as ACCEPTED at the existing product checkpoint. Broader Intro identity acceptance remains separately deferred. Documentation/state-only acceptance update; no redeployment. STOP; no F6/F7 or other optimization authorized. |
| Spotify/YouTube usable-layout minimums for the Wall | **FINDING FOR W1** | Provider acceptance ≠ good layout (Spotify compresses/crops at ~200×80; YouTube 200×200 is a square crop). W1 needs a product minimum / variants and aspect-preserving defaults. See section 7o |

## 11. Video processing policy

The source/Master is the derivation source:

- source → D3;
- future source → D2;
- never D2 → D3;
- never D3 → D2.

Current FREE D3 (F2 TESTING checkpoint `04877c20d213f0105fbdc2871146248194eaf773`; manually ACCEPTED by Mazen 2026-10-07):

- VP9/WebM, `-crf 40`, `-b:v 0`;
- `-deadline good`, `-cpu-used 2`, `-row-mt 1`;
- `yuv420p`;
- F2: downscale oversized coded dimensions within long edge 1920 / short edge 1080; no crop/pad/upscale; preserve display aspect and orientation, source FPS, duration and timing (see `docs/INTRO-DERIVATIVE-F2.md`);
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

## 16. Historical Play Together milestone continuation

Current continuation is section 17 and PROJECT_STATE.md. The following records describe their original milestones, not the current branch or deployment.

### Play Together complete milestone (implemented 2026-09-25; awaiting manual TESTING acceptance)

The earlier Slice 1-only limitation is superseded by Mazen's authorization to complete Play Together from accepted checkpoint `6769c91dd362ee4dceafe15a2961614af218d9e3`. The implementation remains on `feature/play-together-slice-1`; do not merge or extend it before Mazen accepts the complete milestone.

Implemented product paths:

- `NEED_PLAYERS`, `FIND_SQUAD`, and game-rule-driven `TEAM_VS_TEAM` (no hard-coded 5v5).
- `ME` and `US`; US supports fresh invitations to real GamID identities plus mixed manual/unverified guests. Registered members must accept each new attempt. The leader represents guest readiness.
- `PLAY_NOW` and `SCHEDULED`; scheduled starts are future-only within the configurable three-hour horizon, with matching expiry and Ready Check deadlines kept separate.
- Exact game/queue/region technical eligibility followed by compatibility scoring in the approved order: region, mode/queue plus verified game eligibility, position, shared language, mic. No universal rank-distance rule was invented.
- Mandatory host approval with locked/versioned request transitions. Matching recommends; it never admits automatically.
- One active intent reservation per registered entity across hosting, searching, invitations, accepted participation, and matched state.
- Directional, per-game Avoid (maximum two); it is deliberately separate from Block, Report, and rejection.
- Race-safe Ready Check. Every registered participant responds for themselves; the leader responds for guests. Only unanimous readiness opens a canonical GamID Session Room.
- Canonical room lifecycle (`OPEN` → `IN_PLAY` → completion), immutable lifecycle events, history / Played With foundations, and player-level Last Setup written only after successful formation. Host-only fields such as `seats_wanted` are not copied into reusable player preferences.
- Discord is represented only by a generic empty future communication boundary on the room. No Discord IDs, bot, credentials, or canonical state were added.

Database/security:

- Migration `20260925090000_play_together_complete_milestone.sql` adds positions, participants/guests, active-entity reservations, join requests, Ready Checks/responses, rooms, directional avoids, lifecycle events, and private Last Setup; it extends the existing generic session model rather than adding League-specific core tables.
- Migration `20260925093000_play_together_complete_fk_indexes.sql` adds covering indexes for every new foreign key identified by the Supabase performance advisor.
- Migration `20260925094500_play_together_dashboard_join_fix.sql` corrects an applied dashboard join ambiguity without changing product behavior.
- All new exposed tables have RLS enabled. Anonymous and authenticated direct table access is revoked. Public RPCs are security-invoker wrappers over fixed-search-path private security-definer implementations, derive identity through `auth.uid()` → membership → entity, lock transition rows, and return typed domain errors.
- These three migrations were applied only to Supabase TESTING project `upvtrczefcvigxdyuylw`. Disposable behavior fixtures ran inside explicit `BEGIN`/`ROLLBACK`; no real account/session fixture was created and `@black` was not modified.

Technical validation included the complete browser/domain contract suite and a transactional end-to-end database scenario: Create/Find, recommendation, request, host approval, Ready Check, room opening/completion, Last Setup, US member acceptance plus guest, Avoid cap, history, and Played With. Final exact test counts and checkpoint SHAs are recorded in the completion report for this branch.

Intentionally deferred: live Riot rules/availability synchronization, external Discord provisioning, a punitive no-show policy, ratings, reports/blocks, payments, and Production deployment. Riot changes must retain source/version/verification provenance and must use `UNVERIFIED`/`REGION_DEPENDENT` rather than invented availability.

Current exact implementation checkpoint: `37c2699bc1152cfcbd6922600b8c2ba7a1907929` — fix: retry/ack Intro handshake + deterministic asset versioning (Opera reliability), section 7g. Built on top of the `/@handle` redirect race fix `08f516087fa61fe54025dc16b3e715d338f73f5e` (section 7f), the Permanent Public GamID URL + QR + Sharing implementation `b1caefacf4652e090d134e9e50851572e9a088eb` (section 7f), the mobile Publish-button manual-acceptance fix `5f7f380ab08608630ee4e3e59d45181766083f39` (section 7e), Public GamID Profile Slice 2/2 (Public Experience + Intro/Transitions) `ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7` (section 7d), Slice 1/2 (Foundation + Public-Safe Data) `697b6e3773233d4b403becb63a6857893dbe0ea2` (section 7b), the `check_handle_availability_impl` sign-up permission drift fix `6bad4d583735d1e8c589642911f3decd52d7eff2` (section 7c), the accepted Split Reveal Intro-visibility fix `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (section 7a), and the Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`.

Slice 3C exists. Do not restart it. Its backend E2E succeeded and latest automated validation passed. The Split Reveal transition defect within Slice 3C's Full Preview feature is fixed and manually accepted by Mazen (section 7a), but this does not close Slice 3C as a whole — formal acceptance of the rest of Slice 3C was not given, and Mazen intentionally deferred the remaining manual Slice 3C testing/fixes listed in section 9. Do not automatically continue them.

Public GamID Profile Slice 1/2, Slice 2/2, and the Permanent Public GamID URL + QR + Sharing slice all exist, are implemented, and are deployed to TESTING (sections 7b, 7d, and 7f). **None has been formally accepted by Mazen.** `GAMID_ROADMAP.md` items 2, 3, and 4 (Public GamID Profile, Permanent share link, QR sharing) now have no remaining unstarted implementation. Do not infer authorization to start any adjacent roadmap item (Games/Stats/Connections/Socials, a custom domain, platform-specific share integrations, or any AI/Cinematic Identity concept) from any of these slices' existence or position in the roadmap.

A pre-existing, unrelated bug was found during Slice 1/2 testing (`private.check_handle_availability_impl` missing its live `anon` grant, blocking brand-new user sign-up in TESTING) and has since been fixed under separate authorization — see section 7c.

Two genuine bugs were found and fixed during Slice 2/2's own live E2E testing (a message-listener race condition and a CSS `[hidden]` override) — both fixed within this slice's own authorized scope; see section 7d and the section 10 issue register.

A third bug was found by Mazen during his own manual acceptance testing on a real Samsung Android mobile browser — the Publish button could not be activated by a real tap — and has since been fixed under this exact authorized scope only; see section 7e. It went undetected by every prior automated pass because those passes used a synthetic `.click()` call that bypasses real hit-testing.

A fourth bug was found only after deploying the Permanent Public GamID URL to real GitHub Pages: the new `/@handle` redirect (through `404.html`) made the public Intro stage stay blank on roughly 3 of 4 attempts, because the iframe could finish loading and broadcast its ready signal before `public.js`'s deferred module even began executing — a deeper layer of the same class of bug fixed in section 7d, not reproducible against a local static server. Fixed by mirroring `account.js`'s own existing dual-trigger pattern (also listening for the iframe's native `load` event); see section 7f.

A read-only diagnosis (requested separately, performed with no code changes) investigated a real-device report that the public Intro behaves differently in Opera than Chrome, and identified two concrete, evidence-backed risks without proving a single exclusive root cause: a still-unproven-safe handshake timing race, and GitHub Pages' unavoidable `Cache-Control: max-age=600` allowing a browser to legitimately run an older deployed build for up to 10 minutes. Both were then closed under explicit follow-up authorization: the one-shot `ready` broadcast became a bounded retry-until-acknowledged handshake (tolerating either execution order, provably capped, never duplicating playback), and every cross-document reference between the public/account parents and the shared Intro iframe now carries a deploy-derived, automatically-stamped version query string so a stale-cached parent can never end up paired with a mismatched-version child. A related identity-safety gap found during this work — Skip Intro could reveal the raw unconfigured placeholder as if it were a loaded profile — was fixed by only revealing the experience once the child's own state broadcast proves real data was applied. See section 7g. **This is a mitigation validated on Chromium-based tooling only — Mazen's manual acceptance on his real Opera browser is still outstanding and is the actual final acceptance test for the original report.**

**Historical continuation snapshot (Steam/League pending and key-missing statements superseded by §69 and REV-0001 on 2026-10-16):** Gaming Connections Engine — Discord foundation (section 7h) exists at implementation checkpoint `08b7d039bd118513a8e3129a7e8a70d527cd2bfd` and was **manually accepted by Mazen** with real Discord OAuth (the real TESTING GamID is connected to Discord). The Opera reliability work was likewise accepted on his real Opera browser. The Discord `connections` discovery test (section 7i) was run for real and **Discord returned 0 linked accounts, so Riot was not returned**; that route is closed and the stored result is preserved. The current slice is the **League of Legends prototype** (section 7j, implementation `44c7a4455f40088572d165a6de453b73491d6500`): the owner types a Riot ID once and GamID resolves private, **unverified** League details through an isolated, temporary OP.GG adapter (lookups only on Add/Refresh, throttled in the database, never public). It is deployed to TESTING and waits for Mazen's manual acceptance. Do not start public League visibility, Riot RSO/API, Steam/other providers, game discovery, Socials, or Cinematic Identity without authorization, and never add any way around OP.GG blocking or rate limiting. The anonymous TESTING root is now a real **landing page** (section 7k, implementation `3cb0cde7f474cbe7efd194623c6c02853c3de365`) whose Create your GamID / Sign in buttons open the existing `/account/` flow; the old NovaRift/Intro-lab prototype was preserved at `prototypes/slice-1-intro-lab/` and is not deployed. Do not put it back at the root or expose any prototype controls publicly. **Public Profile Expansion Phase 1** (section 7l, implementation `2e0c433eb37458e943dbdd1d3f0d259105ba46a7`) added the per-section "Show on my GamID" switches (Discord, League, Education & Work; all OFF by default except grandfathered Education/Work data) and the server-enforced `public_sections` boundary; the Public Profile redesign and the Cinematic Profile Engine are NOT started. Never widen `public_sections` without an explicit switch, never expose the Discord account id/avatar URL, tokens, diagnostics, League source URL/ledger, and never present the League prototype as verified. **Steam Connection Foundation** (section 7m, implementation `48efec8857a2773d3b3f678cfc7a2ec9f7cbc04a`) added Steam OpenID 2.0 as a second connection provider on TESTING: the SteamID64 is the whole identity result (CONNECTED, never VERIFIED), private by default with its own "Show on my GamID" switch; game-library discovery, Marvel Rivals, other providers, and the Public Profile redesign are NOT started. Never trust a browser-supplied SteamID, never call the Steam Web API or GetOwnedGames without new approval, and keep the Discord/Steam ledger provider guards intact. **Steam My Games** (section 7n, implementation `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`) lets the owner load the games of their connected Steam account through the official `GetOwnedGames` API on an explicit button press (private, discovery only, `DISCOVERED_FROM_STEAM`, Marvel Rivals only *recognized*); it needs the server-side secret `STEAM_WEB_API_KEY`, which is NOT yet set. Never accept a SteamID from the browser, never expose or commit the key, never treat discovery as verification, and never let a failed/private refresh replace the last good list. Marvel APIs/stats/UID, other sources, the Game ID Wall and the Public Profile redesign are NOT started.

**Game ID Wall - Round 2 (2026-09-27; TESTING only; awaiting Mazen's manual acceptance)** on top of `d103de24651b87ab7955ee0474158828aa20e60d`:
- *Inline player contract:* a Player always plays inside its own Wall element (same position, bounds and selected shape; letterboxed, never stretched). The automatic enlarged overlay is removed (it was what TikTok/Twitch opened on Play). Fullscreen only through the provider's own control. Close sits in a bar above the frame, shrinks to 24px on small elements, destroys the frame and restores the facade. The editor keeps a Player element at least the provider's frame minimum plus the bar (Twitch 400x300). Verified in a real browser under the exact CSP/sandbox for YouTube, TikTok, Twitch channel/clip, Spotify, SoundCloud, Vimeo, Kick, Snapchat, X and Instagram. Facebook stays Card/Link (its player needs its JS SDK).
- *Posters:* Edge Function `media-poster` (verify_jwt=false, no secret) fetches thumbnails server-side from documented keyless sources only: YouTube, Vimeo, TikTok, Spotify, SoundCloud, Steam app, and live Twitch channels. It uses per-provider image-host allowlists, hand-followed redirects, signature-checked bytes and size caps, and also serves Steam avatars by hash. The client uses a blob: URL (page CSP unchanged). Adapters declare `poster: true`. Kick, X, Instagram, Facebook, Snapchat and Twitch video/clip keep the neutral poster.
- *GamID block styling:* optional typed `payload.style` (enums, #rrggbb, ranges, booleans; unknown keys refused). JS `dist/wall-kit/gamid.js` and SQL migration `20260927120000_wall_gamid_block_style.sql` are kept identical by the W2 corpus. Opacity applies only to container colours. Trust labels keep fixed colours. "Apply to all GamID blocks" copies only the style.
- *Steam identity:* `supabase/functions/_shared/steam-profile.js` calls the official GetPlayerSummaries server-side (the key is still read only in steam-games.js). It runs on connect/reconnect (the OpenID callback's `onLinked` hook) and on the owner's games refresh. Migration `20260927130000_steam_public_persona.sql` adds `provider_profile_url` and `provider_profile_refreshed_at`, plus a service-role-only `save_steam_profile` with strict checks. The public Steam section gains persona_name / avatar_url / profile_url. Visitors (Wall, public profile) never see the SteamID64: they see the persona or "Steam account". The profile opens only through the address Steam returned. An existing connection gets its persona on the next Steam reconnect or "Refresh games".
Not started: Templates, Video Background, Cinematic Identity, a public Wall route.

Do not start the next implementation slice. First inspect the repository read-only, then discuss the roadmap and next priority with Mazen. Proceed only after he explicitly chooses and authorizes the next work.


## 17. Current Cloudflare TESTING authentication migration — 2026-10-07

**MANUALLY ACCEPTED by Mazen; legacy Pages RETIRED.** Product `2eacf6896f7a8edfcb137ac91889bde34bfe7f03`, branch `feature/play-together-notifications`, based on `dc9393f`. Cloudflare TESTING run `37590268654` SUCCESS; six targeted Edge Function bundles verified against committed sources; TESTING Auth default/sole redirect is Cloudflare Account. Full build: 1,651 tests / 1,650 PASS / one existing skip / zero failures; lint and typechecks PASS. No database migration.

Source of architecture, exact versions, safe browser/live verification, legacy-reference classification and rollback: [docs/CLOUDFLARE-AUTH-MIGRATION.md](docs/CLOUDFLARE-AUTH-MIGRATION.md). F2/F3/F4/F5 and accepted Account/Public/Wall/Play Together/Team Voice behavior remain preserved. No real user, Wall or session mutated for verification; provider success exercised in fixtures, not manual real-account authorization.

Mazen manually verified PASS: signed-out Play Together → sign-in → automatic return; Wall Editor → Account sign-in → return/reload; Discord reconnect OAuth → Cloudflare return; Team Voice provisioning/join; Steam refresh; Public Profile + Intro + Wall. He explicitly authorized retirement.

Pages site unpublished and deploy-pages.yml disabled repository-wide on 2026-10-07. Branch workflow is inert with no deployment permissions/actions. History and previous runs remain. Cloudflare Auth/provider/Team Voice configuration is unchanged. Remaining incoming legacy CORS/Steam assertion compatibility is not a frontend dependency and is preserved to avoid changing accepted backend behavior. See specialist record. STOP; no main merge, Production, Monitor or unrelated work.

## 18. Intro 30-second boundary tolerance — 2026-10-07

Product 6e2cbdae9d61f106de806f2d42b99c8209299867, same continuation branch. User-facing maximum remains 30 seconds; inclusive 31.0-second internal ceiling is aligned across browser, job CHECK, queue, worker source/output and completion. Source/derivative millisecond rounding cannot admit a value over 31. Existing Usage ownership, security, F2 encoding and F5 streaming are preserved. No real media reprocessing.

Implementation, migration, validation, deployment evidence and manual acceptance: docs/INTRO-DURATION-TOLERANCE.md. Manual acceptance PENDING; STOP after TESTING deployment and verification. No Android MP4 Wall bug, main merge, Production, Monitor or unrelated task.

Deployment COMPLETE and verified: TESTING duration migration applied once (live version 20261007124147), all 24 rollback-only DB assertions PASS. Worker build 3e9d872e-01e0-4aa4-96f0-ad6fde84f702 SUCCESS; image-only update and synthetic execution gamid-intro-worker-testing-vzfgv PASS with exact worker hash. Cloudflare run 37625207643 SUCCESS serving 1517eb179e0fcc5a8c01644c4922efd2d4591c90; served Account code/stamp verified. Live frontend fixture accepts 30.8/31.0 and rejects 31.1, without real backend mutations or uploads. Full suite/lint/typechecks already passed and were not repeated. Exact evidence and manual steps are in the specialist document. STOP for Mazen acceptance; do not repeat migration, reprocess existing media or start another task.


## 19. Intro D3 frame-timing correction — 2026-10-08

Mazen's Android duration-boundary manual acceptance FAILED with D3_TIMING_OR_GEOMETRY_MISMATCH. Exact read-only job/log investigation and isolated source reproduction identified average/nominal container FPS metadata mismatch, not a 31-second ceiling conflict. Existing source/output geometry, duration and 909 frames were preserved.

Correction product 3f72eb23ef483ca29b9076715ec76ab311dcbcfe is pushed on feature/play-together-notifications. Only mismatching average-FPS metadata uses strict equal-frame-count/per-frame timestamp validation. F2 encoding/scaling/audio and F5 delivery, private authorization, 30-second wording and 31-second ceiling are preserved. No migration or frontend code change. Full suite 1672 PASS / one existing skip; lint/typechecks PASS; native F2 11/11 and exact-source local reproduction PASS.

TESTING worker rollout COMPLETE: Cloud Build cf42e234-99ef-4ded-b66a-9037f5fc72b9 SUCCESS; image-only update and pinned worker hash verified; F2 smoke gamid-intro-worker-testing-h69z2 PASS. Dedicated normal-upload/queue/dispatcher fixtures reached READY with exact active-job association. Wrapper qrkhf failed only during test-account cleanup, triggering an automatic retry; both disposable fixtures are now fully cleaned up (zero users/entities/jobs/objects). Do not rerun that unchanged harness or call its wrapper PASS. Exact digest, snapshots, limitation and manual retest: docs/INTRO-DURATION-TOLERANCE.md. Frontend stays 1517eb1, migration unchanged. STOP for Mazen Android retest; manual acceptance remains PENDING. Original failed real jobs and protected users/media remained unchanged; no Production, main merge or Monitor work. GamID Truth: NO CHANGE REQUIRED.


## 20. Profile Editor independent sections and lifecycle completion — 2026-10-09

Product `8ce1616ce4024c0f875f97094dc516c8e62e41a1` on `feature/play-together-notifications`; PENDING_ACCEPTANCE. Initial implementation `5adcac4`, previous pushed lifecycle fix `96ee33c` preserved. All 17 existing sections expand independently; editable section saves isolate drafts and retain existing backend/security/workflow boundaries. Exact inventory and manual acceptance: [docs/PROFILE-EDITOR-UX.md](docs/PROFILE-EDITOR-UX.md).

Final review closed reused-node feedback ownership: dispose old timers/observers/listeners, ignore retired callbacks, clear feedback at sign-out/editor restore, and suppress stale save outcomes after an owner switch or same-account re-sign-in using an editor lifecycle generation. Five actual visible seconds for transient feedback; actionable and field validation errors persist. Global Notifications remain unchanged.

74/74 focused checks PASS; lint/typechecks/diff check PASS. Reused prior full-suite evidence (1,687 PASS / one existing skip); final workflow complete build PASS. Local and final served-frontend Chrome fixtures at 1280/390 pass all 17 section toggles, independent saves, retry/validation, five-second visible timing, sign-out/re-sign-in and account switch isolation, notification destinations and no horizontal overflow/page errors. All backend traffic mocked; no real users/media mutated. Narrow Chrome is not real Android acceptance.

TESTING workflow [37862526301](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37862526301) SUCCESS; exact `8ce1616ce4024c0f875f97094dc516c8e62e41a1` Account HTML stamp and six changed frontend files verified byte-for-byte. No database/schema/storage/worker/auth configuration changes. Truth UPDATED: existing editor capability checkpoint/contracts, still PENDING_ACCEPTANCE. Prior Intro Android duration-boundary acceptance remains separately PENDING (§19). STOP for Mazen; no Production/main/Monitor/unrelated work.

**Profile Editor QA fixes — 2026-10-09.** Current product checkpoint `5e2664ee66298a0a6f914507b63a14abab10fa05` on `feature/play-together-notifications`; PENDING_ACCEPTANCE. It contains four fixes, with tests, in `58720da140464c11f07f2d2f5ad6a4d49538efad`:
- the internal "LIVE PREVIEW" label no longer overlaps the avatar and name;
- a field-validation notice is cleared once that field becomes valid;
- the Saved message shows one success icon (CSS) and no duplicate textual checkmark;
- a ⋮ Account header menu holds Sign Out, reusing the existing sign-out button and handler.

`5e2664e` moves the new Account-menu and preview styles out of the Steam-scoped CSS region. The first deploy (run `37864954855`, at `58720da`) had stopped in full validation on the two Steam scoping tests (`steam-connection`, `steam-games-contract`), before deploying.

TESTING workflow [37865851238](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37865851238) SUCCESS: 1,696 tests, 1,692 pass, 4 skipped, 0 fail; Cloudflare version `d5ee4aa7-8141-40a2-b486-826a7ab2e496`. That run stamped `?v=da2e020`. Cause:
- `scripts/stage-cloudflare.mjs` stamps the first 7 characters of `GITHUB_SHA`;
- the runner does not let a step override built-in `GITHUB_*` variables, so the workflow's `env: GITHUB_SHA: <source sha>` is ignored;
- the stamp is therefore the commit of the workflow's dispatch ref, which was `main`.

Corrected without any code change, by redeploying from a deploy-only branch ref, `feature/deploy-5e2664e`, which points exactly at `5e2664e`:
- workflow [37866396455](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37866396455) SUCCESS: 1,696 / 1,692 pass / 4 skipped / 0 fail; staged "asset version 5e2664e"; Cloudflare version `3cc18b33-2184-48a9-a53b-e6782545486d`;
- served `account/index.html` equals the `5e2664e` source with stamp `5e2664e`;
- its four referenced assets and all 18 modules imported by `account.js` are byte-identical to `5e2664e`.

To get a correct stamp, the dispatch ref must point exactly at the product commit being deployed. No database, schema, storage, worker or auth change.

STOP for Mazen's manual acceptance of the four fixes.

**Profile Editor save-error notification lifecycle — 2026-10-09.** Current product checkpoint `fd9c9a9df25583050991b5069a087142abeb13b9` on `feature/play-together-notifications`; PENDING_ACCEPTANCE. Bug: clearing Identity → Display Name and saving showed the inline field error and a red notification below Save Changes, and both stayed indefinitely. Cause: every save failure went through `reportSection(key,text)` in `dist/account/account.js`, whose default marks errors persistent, so the five-second timer never started.

Fix (`dist/account/account.js` only, in product code): recognised field-validation failures (name/bio/roles/education reasons) report the notification below Save Changes as transient, with five visible seconds. The inline field error, `aria-invalid` and the kept input value persist until the field is valid; correcting the field still clears both at once. Actionable errors, such as a network failure, stay persistent, and success is unchanged. The four QA fixes are preserved. The Truth `profile-feedback-lifecycle` contract and `docs/PROFILE-EDITOR-UX.md` are narrowed to match. Tests:
- a focused regression in `tests/profile-editor.test.js`;
- the mocked Chrome fixture `scripts/profile-editor-browser.mjs`, which now asserts the notification is hidden after 5.1 s while the inline error remains.

Local results:
- full suite 1,697: 1,696 pass, 1 skip, 0 fail;
- lint, authenticated-shell audit, typecheck and diff check PASS;
- fixture PASS at 1280 and 390, with all backend traffic mocked.

TESTING deployment, from deploy ref `feature/deploy-fd9c9a9` pointing exactly at the product commit:
- workflow [37867823079](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37867823079) SUCCESS: 1,697 tests, 1,693 pass, 4 skipped, 0 fail;
- staged "asset version fd9c9a9";
- Cloudflare version `560aa9a7-efaf-4dbe-bdd5-d87ddf0c94c8`;
- served `account/index.html` is byte-identical to the stamped source, with stamp `fd9c9a9`;
- `account.js`, `transient-message.js`, `profile-editor.js` and `account.css` are byte-identical to their Git blobs.

No database, schema, storage, worker or auth change. STOP for Mazen's manual acceptance.

## 21. Product Memory V1 — 2026-10-09

Governance and documentation only; awaiting Mazen's acceptance. `product-memory/` holds reasoning records (DIS / DEC / IDEA / ISS / REV) with one template per category, `archive/`, and a single index, `product-memory/INDEX.md` (layout, statuses and transitions, lookup, ID counters, Register).

- **Rules:** `AGENTS.md` → Product Memory. The entry order is extended to seven steps, Review Before Save is mandatory, and approval, authorization, implementation and acceptance stay separate. Completion reports add a `Product Memory:` line.
- **Pointers:** `PROJECT_STATE.md` and `CLAUDE.md` point to the index.
- **Validation:** `scripts/product-memory.mjs` (no dependencies; `check` / `list` / `next`) runs in `npm test` through `tests/product-memory.test.js`, which includes malformed-record, broken-reference and index-drift fixtures.
- **Not done:** no records were saved and nothing was migrated. No application code, deployment, database, Monitor or Truth change.

## 22. Unified upload and Add error feedback (ISS-0001..ISS-0005) — 2026-10-09

Product checkpoint `d2c24b9dede6614a84f98bdec22ca3c7ea11995d` on `feature/play-together-notifications`; manual acceptance PENDING. It implements the five audit phases Mazen authorized (Product Memory ISS-0001, with BUG records ISS-0002 to ISS-0005, all FIXED, none VERIFIED).

**The pattern.** One persistent inline box (`dist/app/upload-feedback.js`) next to the control that failed:
- the reason and next step;
- Retry only for retryable failures (network, gateway, expired or conflicting upload), never for the storage quota, a Wall limit or hard validation;
- View Usage only for the storage quota and Wall limits, opening the existing shell Usage panel (`openUsagePanel` in `dist/app/authenticated-shell.js`);
- Dismiss, which returns focus to the upload control.

The box has role `alert` and is linked to its button with `aria-describedby`. It stays until dismissed or resolved. No limit figure is hardcoded; the server stays authoritative.

**Changes by surface.**
- **Wall** (`dist/wall-kit/assets.js`, `dist/wall-editor/assets.js` and `tools.js`):
  - quota, gateway and network codes are mapped;
  - the stale 10-video text and `maxVideos` are removed;
  - a failed video is never called an image;
  - one Assets upload at a time (Upload is disabled, and a second pick is refused);
  - a background video upload in progress refuses another;
  - a box sits under Upload and beside the background video;
  - a delete resolves a limit or quota error.
- **Intro** (`dist/account/domain.js`, `resumable-upload.js`, `account.js`):
  - messages refer to Save Changes instead of the removed SAVE GAMID button;
  - gateway refusal codes have their own words;
  - a 4xx refusal of a chunk keeps its code and is not retried (one PATCH, then the upload is terminated);
  - a failed replacement is shown while the active Intro stays active;
  - worker failure codes are mapped to reasons.
- **Avatar** (`dist/account/account.js`, `supabase-client.js`):
  - sign-up and Profile Editor Avatar errors use the same box;
  - a network drop names the upload instead of "Authentication service";
  - an avatar stored but never taken by the profile is deleted only after the owner's current profile is read back without it, because the gateway itself would allow deleting the attached avatar.

**Tests.**
- Full suite: 1,740 tests, 1,739 pass, 1 skipped, 0 fail. Lint, authenticated-shell audit, typecheck, Product Memory validation and diff check: PASS.
- New: `tests/upload-feedback.test.js` (classification, the box, the Wall quota through the real client with a stubbed gateway, Intro messages, chunk refusal, avatar orphan guard).
- Browser fixtures, all backend traffic mocked, at 1280 and 390, local and against the served TESTING files (`--live`), all PASS:
  - `scripts/profile-editor-browser.mjs`, extended with avatar quota, View Usage, Dismiss, orphan removal, Retry after a dropped connection, an invalid Intro file and a failed replacement Intro;
  - new `scripts/wall-upload-browser.mjs`: quota, View Usage, Dismiss, Retry, a single upload at a time, the video limit, and resolution by delete.

**TESTING deployment.**
- Workflow [37876188206](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37876188206) SUCCESS from ref `feature/play-together-notifications`, whose head was exactly `d2c24b9`: 1,740 tests, 1,736 pass, 4 skipped, 0 fail.
- Cloudflare version `62ac3cb0-df69-4fb0-a464-a95f89b95201`.
- The Account HTML stamp reads `d2c24b9`. The Account and Wall Editor HTML and the eleven changed frontend files are byte-identical to `d2c24b9`.

No database, schema, storage, Edge Function, worker or auth change. GamID Truth unchanged: no capability status, limit or approved contract changed. STOP for Mazen's manual acceptance.

## 23. Profile Editor completion: My Socials, Save All Changes, Account Settings menu — 2026-10-09

Product checkpoint `9e11076bb1ea19eb09e911030ad1dcc6cdd09150` on `feature/play-together-notifications` (`97853c4` plus a desktop socials-row layout fix); manual acceptance PENDING. Authorized by Mazen from the DIS-0003 notes; Product Memory DEC-0001 (IMPLEMENTED). IDEA-0001 (dashboard redesign) unchanged, DEFERRED.

**Before.** Account Settings was a standalone section (signed-in email, Language with its own save, Sign Out already moved to the ⋯ menu). A static IDENTITY BOARD · FUTURE card listed "Socials". There was no Save All Changes (DIS-0003 called it existing; it was not). No social-link data existed.

**Changed.**
- `dist/account/index.html`: PROFILE INFORMATION label; My Socials section after the profile form (placeholder removed); Save All bar at the end.
- `profile-editor.js`: `socials` section with its own Save Changes; email, Language and Sign Out in the ⋯ menu, with no Language save button.
- `socials.js` (new): catalog, normalization, validation, editor, public icons.
- `account.js`: socials load / dirty / save branch (refused only after validation; no save until the saved list has loaded); `saveEditorSection` returns its outcome; Save All handler; Language applied on change and reverted on failure.
- `supabase-client.js`: socials RPCs.
- `public/public.js` and `public.css`: a Socials block leads the public sections panel; `renderPublicSections` and the accepted page grid are unchanged.
- `account.css`.
- Migration `20261009120000_my_socials.sql`.

**Database (TESTING).**
- Rehearsed first inside a transaction ending in ROLLBACK, as GM-TEST-01 / GM-TEST-02: 12/12 checks passed.
  - Owner save, `javascript:` refused, a refused list changes nothing, look-alike host refused, no Other.
  - Table closed to authenticated; another persona sees nothing.
  - Anonymous: owner functions closed; a DRAFT GamID shows nothing; a PUBLIC GamID shows its links in order.
- Applied once in its own transaction, then `migration repair --status applied 20261009120000`.
- Verified: 12 platforms, 0 links, anon may read only the public reader, authenticated has no table access.

**Tests.**
- Full suite 1,749: 1,748 pass, 1 skip. Lint, shell audit, typecheck, Truth and Product Memory validation pass.
- New `tests/my-socials.test.js`: catalog parity with the migration, normalization, dangerous links, safe rendering, and the real migration in PGlite (ownership, permissions, all-or-nothing, PUBLIC gate, cascade). It caught a `platform_key` check that refused the one-letter key `x` before anything reached TESTING.
- Mocked browser fixtures at 1280 and 390, local and served (`--live`):
  - `scripts/profile-editor-browser.mjs`: socials add/edit/remove and inline refusal, Save All, duplicate click, partial failure, network loss and recovery, Language and Sign Out in the menu, and every earlier scenario;
  - new `scripts/public-socials-browser.mjs`: icons below the profile without a Wall, the `javascript:` link never drawn, nothing for an empty list;
  - `scripts/wall-upload-browser.mjs` (regression).
- Real end-to-end on TESTING as GM-TEST-01, desktop and mobile, behind the Monitor guard, writes limited to socials / bio / language: 20/20 PASS.
  - Covered: add and persist, edit and remove, dangerous link refused, Save All of Bio and My Socials, Language from the menu (restored), Sign Out from the menu, and the DRAFT public page showing nothing.
  - Cleanup verified: no links remain on TESTING, the persona's bio and language are restored, and it stays DRAFT.

**Deployment.**
- Workflows [37883751545](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37883751545) (`97853c4`, Cloudflare version `e5112982-a595-4359-b7ba-304c7e484e07`) and [37884326476](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37884326476) (`9e11076`): both SUCCESS from the branch ref, whose head was exactly the product commit.
- The Account and Public HTML stamps and the changed files match Git byte-for-byte.

**Not done / limits.**
- Socials are not shown while a published Wall replaces the profile body.
- Icons are consistent colour badges with a short mark, not official brand logos.
- The desktop Play Together / My Wall card typography note (DIS-0003) was out of scope.
- Real Android was not tested.

STOP for Mazen's manual acceptance.

## 24. One social link engine for the Wall and My Socials; Discord personal profiles — 2026-10-09

Product checkpoint `67042938426f7c234c175483c6882c709b09046d` on `feature/play-together-notifications`; manual acceptance PENDING. Product Memory DEC-0002 (IMPLEMENTED).

**Root cause.**
- My Socials kept its own platform/URL pattern catalog (browser and server) beside the Wall's link engine: two independent rule sets.
- The Wall's Discord adapter knew server invites only, so `https://discord.com/users/<id>` was refused in the Wall as unrecognized content.

**Changed.**
- **Wall** (source of truth):
  - `wall-kit/embed/providers/discord.js` adds the kind `profile` (`discord.com/users/<17-20 digits>`, opened at that same official address), declared Link only;
  - `wall-kit/embed/engine.js` lets a kind narrow its presentations, and validation refuses others;
  - `wall-editor/controls.js` derives Show as from the engine instead of a fixed list;
  - migration `20261009150000_wall_discord_profile` (additive) adds the row to `private.wall_embed_specs`;
  - invites, all other providers and every saved Wall are unchanged.
- **My Socials:**
  - `account/socials.js` has no patterns: `detectEmbed` recognizes the platform and kind, the adapter's id rule validates, `openUrl` rebuilds the address, and labels come from the adapters;
  - it stores `{ platform, kind, id }`; account kinds only (Instagram/TikTok/X/Snapchat profile, YouTube/Twitch/Kick channel, Facebook page, Discord profile or invite);
  - migration `20261009151000_my_socials_link_engine`: links stored as `kind` + `account_id`, validated against `wall_embed_specs`, `social_platform_catalog.account_kinds`;
  - Threads, Reddit and LinkedIn removed (not Wall platforms);
  - saved links are converted losslessly, and one that can't be expressed stops the migration.
- RLS, ownership, the PUBLIC gate, Save Changes / Save All, Discord OAuth / Connections and the public layout are unchanged. Content is never copied between the Wall and My Socials.

**@black.** The only saved My Socials link on TESTING was @black's Discord profile, the URL under test. Mazen approved converting it.
- Before: discord, `https://discord.com/users/374102653111762948`, order 0, updated `04:59:22.601022`, entity md5 `30fe0d86…`.
- After: discord / profile / `374102653111762948` (the engine rebuilds the identical URL), same order, same timestamp, same entity md5.
- The anonymous reader returns it; nothing else of @black was touched.

**Tests.**
- Full suite 1,748: 1,747 pass, 1 skip. Lint, typecheck, Truth and Product Memory validation pass.
- `tests/my-socials.test.js`:
  - one engine (no own patterns; every platform and kind in the adapters and in `wall_embed_specs`; account-kind parity);
  - the Discord URL on both surfaces; invites; dangerous, foreign and content links;
  - the three migrations in PGlite, including lossless conversion and refusal of an inexpressible link.
- `tests/wall-post-qa-media.test.js`: capability matrix (Discord profile Link only); Show as derived from the engine.
- `tests/wall-w3-editor.test.js`: `socials.js` may import only the shared link engine, never the editor or draft.
- TESTING rehearsal of both migrations in a rolled-back transaction: 15/15 PASS.
- Mocked fixtures at 1280/390, local and served `--live`: Profile Editor (Discord profile saved as parts, video refused), public socials (Discord icon opens discord.com/users/<id>), Wall (Discord profile Link only, invite Card/Link, unsafe link refused).
- Real on TESTING as GM-TEST-01, desktop and mobile: 18/18 PASS.
  - Wall without saving: Link only, invite Card/Link, unsafe link refused.
  - My Socials: video refused; the same Discord URL saved and reloaded as that exact address with the Discord icon; edited to an invite; removed.
  - The persona ends with 0 links.

**Deployment.** Workflow [37892333328](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37892333328) SUCCESS from the branch ref, whose head was exactly `6704293`. The Account stamp reads `6704293`, and the changed files match Git byte-for-byte.

**Not done / limits.** Threads, Reddit and LinkedIn are no longer available in My Socials. With a published Wall (as @black has), the Wall replaces the Classic Profile, so the icon is not shown there.

STOP for Mazen's manual test of the Wall and the Classic Profile.

## 25. Enable / Disable My Wall — 2026-10-09

Product checkpoint `85146e679faaa88de46e0271f0ec5f16fbebf409` on `feature/play-together-notifications`; PENDING_ACCEPTANCE. Product Memory DEC-0003 (IMPLEMENTED); Truth `wall-visibility-toggle`.

**Architecture.**
- Unpublish deletes the published snapshot, so it cannot serve as Disable.
- Migration `20261009170000_wall_public_publishing_toggle` adds `wall_publications.is_enabled` (NOT NULL DEFAULT true: existing published Walls stay enabled, no data rewritten).
- `get_public_wall_impl` and `wall_object_is_published` (the published-media read policy) now also require `is_enabled`.
- New owner-only RPCs `get_my_wall_visibility()` and `set_my_wall_enabled(boolean)`: the caller's own publication through `wall_owned_entity_id()`, with no owner argument; `WALL_NOT_PUBLISHED` when there is no published Wall.
- Unchanged: Publish / Unpublish and the snapshot. Republishing keeps the choice.
- The public page needed no change: the server returns no Wall for a disabled one, so the Classic Profile shows.

**Profile Editor.**
- `dist/account/index.html`, `account.js`, `account.css`, `supabase-client.js`.
- My Wall shows the saved state (Enabled / Disabled / Not published), EDIT WALL plus Disable My Wall / Enable My Wall, and the approved confirmations (Confirm / Cancel).
- One change runs at a time. Success is shown only after the server's answer confirms it; a failure keeps the previous state with a clear error. The section summary shows the state.

**TESTING.**
- Before: published Walls of @black (md5 `4b1e3b68…`, revision 52, 2026-10-07 07:47:29) and @zshot (md5 `085e348f…`, revision 8, 2026-10-04 11:07:51).
- Rehearsed inside a rolled-back transaction: 13/13 PASS.
- Applied once and history repaired.
- After: both identical and enabled, and both still served to visitors.

**Tests.**
- Full suite 1,752: 1,751 pass, 1 skip. Lint and typecheck pass.
- New `tests/wall-visibility.test.js`: the real publishing migration plus this one in PGlite (backward compatibility; the public result table; snapshot, media and visibility preserved; republish keeps the choice; PRIVATE stays private; no cross-user or anonymous toggle) and UI wiring.
- Mocked fixtures, local and served (`--live`), 1280/390: Profile Editor (state, Cancel, Confirm Disable/Enable, one call per confirm, failure keeps state) and public (enabled Wall replaces the profile; disabled Wall gives the Classic Profile).
- Real end-to-end as GM-TEST-01, desktop and mobile: 24/24 PASS.
  - Visible while enabled; Cancel changes nothing; simulated failure keeps Enabled with an error; Disable gives signed-out visitors the Classic Profile while the GamID stays public.
  - After refresh and in a new session: still Disabled. The editor still opens with the publication kept.
  - Enable restores the same snapshot and persists. PRIVATE shows nothing either way. No page errors.
- Cleanup: Wall unpublished and the persona returned to its original DRAFT. The GamID switch can only set PRIVATE, so DRAFT was restored with one targeted update on GM-TEST-01. Final state: DRAFT, no publication, draft revision 1, no links.

**Deployment.** Workflow [37894870969](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37894870969) SUCCESS from the branch ref, whose head was exactly `85146e6`. The Account stamp reads `85146e6`, and the changed files match Git byte-for-byte.

**Limits.** The Wall editor still shows its own Published state while the Wall is disabled (unchanged by scope); Enable / Disable lives only in the Profile Editor. Real Android was not tested.

STOP for Mazen's manual acceptance.

## 26. Discord Profile Card in My Socials — 2026-10-09

Product checkpoint `5757c5fcd1be61c5058718d971aef200bb751341` on `feature/play-together-notifications`; PENDING_ACCEPTANCE. Truth `discord-profile-card`; Product Memory DEC-0004 (IMPLEMENTED).

**Preflight.** Branch clean at `88272ac`, equal to origin. The read-only Discord OAuth audit was re-checked against the code and still holds:
- `supabase/functions/_shared/discord-oauth.js` requests exactly `identify connections`, reads `/users/@me` once and revokes the token at once.
- `gaming_connections` holds the id, username, display name and a 128 px CDN avatar address.
- Team Voice has its own `identify guilds.join` consent.

On TESTING, `gaming_connections` also carries the later Steam columns (`auth_method`, `provider_profile_url`, `provider_profile_refreshed_at`).

**Discord terms.** Reviewed the official Developer Policy and the Developer Terms §5 (effective 2024-07-08) before implementing:
- §5(b)(iii) allows sharing API Data when the user expressly directs it, with proof on request. This feature uses a separate opt-in and records the consent time.
- §5(b) deletion: turning the card off or disconnecting removes it at once. There is no public copy.
- Policy rules 15–20 (purpose, no scraping or selling): nothing beyond the stated card.
- **Open requirement (not a code change):** §5(a) requires a public privacy policy for the application, linked in the Discord Developer Portal. GamID has none yet, and only Mazen can add the Portal link.

**Implementation.**
- Migration `20261009190000_discord_profile_card` (additive):
  - `show_profile_card boolean not null default false` and `profile_card_consented_at`, with checks that the card is Discord-only and that ON always carries a consent time.
  - Owner RPCs `get_my_discord_profile_card()` and `set_my_discord_profile_card(boolean)`: the caller's own row, no owner argument, `DISCORD_NOT_CONNECTED` without a connection. A repeated ON keeps the first consent time.
  - Anon RPC `get_public_discord_card(handle)` returns `discord_id, username, display_name, avatar` only when all the conditions in Truth hold. The avatar must be this account's Discord CDN address, else null.
  - `get_public_identity`, OAuth, Disconnect and Team Voice are untouched.
- **Profile Editor** (`dist/account/account.js`, `account.css`, `supabase-client.js`):
  - Connections → Discord shows "Show Discord Profile Card" with the approved description.
  - Staged like the other switches and saved by the Connections Save Changes. It is shown ON only from the server's answer; a failed save keeps the server's confirmed state with the section error.
  - Disabled with "Connect Discord first." while not connected.
  - A hint names what is still missing: Show on my GamID, the matching My Socials link, or a published GamID.
- **Classic Profile** (`dist/public/discord-card.js` new, `public.js`, `public.css`):
  - When My Socials shows a Discord personal profile, the page asks for the card. It attaches only if the card's id is that link's id.
  - Clicking opens a modal card: avatar (initial fallback), name, @username, Connected account, Open on Discord, and "Discord may ask you to sign in."
  - Esc, Close and an outside click dismiss it, and focus returns to the icon. Modified or middle clicks keep the plain link.
  - The Wall is not changed.

**TESTING database.**
- Before: 5 connection rows (row-set md5 `9d49dc63…`); @black and @zshot Discord and Steam row hashes recorded.
- Rehearsed in an aborted transaction: 14/14 PASS. The functional path used a temporary GM-TEST-01 row, rolled back. Confirmed nothing persisted.
- Applied once and history repaired.
- After: the same md5 over the original columns, the same @black / @zshot hashes, every row OFF, and no card for @black or @zshot.

**Tests.**
- Full suite 1,760: 1,759 pass, 1 skip. Lint and typecheck pass.
- New `tests/discord-profile-card.test.js` (8 tests), with the real Gaming Connections migration and this one in PGlite:
  - default OFF and additive;
  - opt-in / opt-out and consent;
  - each condition;
  - mismatched, invite, missing and inactive link;
  - malformed avatar and id;
  - Disconnect, and reconnect starting OFF;
  - owner-only access and anonymous denial;
  - UI wiring.
- `tests/public-my-games.test.js` gains the migration name in its pinned list.
- Fixtures, local and `--live`, 1280/390:
  - public: card, mismatch, ordinary link, keyboard / Esc / Close / outside click, fit and 44 px targets;
  - Profile Editor: OFF default, failure keeps the state, one request per save, persists, disabled after Disconnect.
- Real TESTING as GM-TEST-01, desktop and mobile, read-only (guard on, no writes): 8/8 PASS. The server reports not connected, and the switch is OFF and disabled with the approved text.
- Not run for real: a connected owner opting in and a visitor opening the card. No GM-TEST persona has a Discord account, and no OAuth was performed.

**Deployment.** Workflow [37898776747](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37898776747) SUCCESS from the branch ref, whose head was exactly `5757c5f`. The Account stamp reads `5757c5f`, and the 6 changed files match Git byte-for-byte.

**Limits.**
- The card shows what Discord returned at the last connect or reconnect; a new avatar appears after Reconnect.
- Visitors' browsers load the avatar from Discord's CDN.
- A published Wall still replaces the Classic Profile, so no card is shown there.
- No privacy policy exists yet (see above).
- The approved interactive simulation was not available in this session; the layout follows the written specification.

STOP for Mazen's manual acceptance with @black.

## 27. Discord Profile Card acceptance; Classic Profile desktop redesign decisions (Phase 0) — 2026-10-10

Documentation only. No product, database, storage or deployment change.

**Acceptance.** Mazen manually tested the Discord Profile Card (§26) on TESTING and explicitly ACCEPTED it on 2026-10-10. The implementation checkpoint stays `5757c5fcd1be61c5058718d971aef200bb751341` (TESTING run 37898776747). The records now say:
- Truth `discord-profile-card`: ACCEPTED.
- Product Memory DEC-0004: ACCEPTED.

The open Discord Developer Terms 5(a) requirement (a public privacy policy linked in the Developer Portal) is unchanged and still Mazen's to resolve.

**Desktop redesign decisions.** Mazen approved the product decisions for the Classic Profile desktop redesign. They are recorded in Product Memory **DEC-0005** (APPROVED, not authorized):
- breakpoint 1280px;
- 6:1 Banner at 1920×320, from a source file of at most 5 MB in JPEG, PNG, WebP, GIF (static first frame) or AVIF, desktop only, with crop and position controls and a gradient fallback;
- the separate Discord section leaves the desktop Classic Profile only;
- Member Since from `entities.created_at`;
- About Me Location (max 60), Languages (max 5) and Favorite Genres (max 5), each hidden until opted in;
- the hero game count only when My Games is public;
- `avatars` bucket reuse only once its safety conditions are proven;
- mobile, the Intro engine, Full Preview, Wall behaviour and the Manual labels kept.

**Truth.** Truth describes only what exists on TESTING, so none of this is in it yet. The redesign intentionally changes two current presentation facts, which Truth will record when that work is implemented:
- the Discord section disappears from the desktop Classic Profile;
- the desktop hero is built by the public page rather than the Intro frame.

Until then, the current contracts (`public-section-visibility`, `public-my-games`, `public-wall-publishing`, `wall-visibility-toggle`, `intro-transition-engine`) stay as they are.

STOP: Phase 1 needs Mazen's explicit approval.

## 28. Classic Profile Banner — Phase 1B storage and backend: HALTED at a stop condition — 2026-10-10

Authorized: Phase 1B only (TESTING). Product Memory DEC-0005 (AUTHORIZED). **Not implemented, not accepted.** Truth unchanged.

**Built and deployed.**
- **Migration `20261010120000_profile_banner`** (additive):
  - `profiles.banner_media_reference` and `banner_updated_at`, with a check that the path is `<uid>/banner/<uuid>.jpg`. An Avatar path, which has no sub-folder, can never be a Banner.
  - Owner RPCs `get_my_banner`, `attach_my_banner(path, expected)` and `remove_my_banner(expected)`, both writes compare-and-set; `list_my_unattached_banners` lists objects older than an hour.
  - Service-only `authorize_banner_delete`.
  - Storage policies "public profile banners are readable" (anon SELECT only of an attached Banner of a PUBLIC SOLO GamID) and the restrictive "attached banners cannot be deleted".
  - Avatar policies, the usage functions and the quota were not touched.
  - Rehearsed in an aborted transaction (16/16), confirmed nothing persisted, applied once, history repaired.
- **`usage-upload` v6.** Deployed source verified identical to Git; v5 had been verified identical to the previous Git first. For `avatars/<uid>/banner/…` paths:
  - only a direct POST of at most 5 MiB is accepted;
  - the declared type must be `image/jpeg` and the SOF must be exactly 1920×320, checked before decoding;
  - the image must end with an EOI marker and fully decode with **jpeg-js 0.4.4** (`npm:jpeg-js@0.4.4`, pure JavaScript; non-tolerant mode, 1 MP and 32 MB limits);
  - the gateway stores its **own re-encoded JPEG** (quality 85, deterministic), so no EXIF, GPS or trailing payload survives;
  - TUS is refused for Banners;
  - every refusal happens before any reservation;
  - deleting an attached Banner is refused.
- **Unchanged:** Avatar and every other path. Avatar files are still stored byte-for-byte.
- **Storage:** reuses the private `avatars` bucket (5 MiB limit, `gateway_required = true`). Banner bytes count in the existing 200,000,000-byte quota, under the "avatar" category. The "Avatar & Banner" label is deferred to Phase 2, because no frontend was deployed.
- **The decision to store Banners as JPEG** (instead of the planned WebP) came from the decoder choice approved by Mazen together with the jpeg-js and Supabase CLI downloads. The CLI was re-downloaded as v2.117.0 from the official GitHub release, with SHA-256 verified.

**Tests.**
- Full suite 1,773: 1,772 pass, 1 skip. Lint and typecheck pass.
- New `tests/profile-banner-gateway.test.js` (7 tests, with the real jpeg-js): accepted and re-encoded; metadata removed; wrong type, size, truncation, corruption and 5 MiB refused with nothing reserved; fails closed with no decoder; strict paths; TUS and other owners refused; delete protection; Avatar unchanged.
- New `tests/profile-banner.test.js` (6 tests, PGlite with the real Avatar read-policy migrations): compare-and-set; ownership, receipt, type and size; the exact anonymous read rule across PUBLIC, PRIVATE, DRAFT, unattached and replaced; delete protection; orphan listing; anonymous denial.

**Live on TESTING (GM-TEST-01; tokens kept in memory only).**
- 44 of 46 checks passed:
  - every refusal, with usage unchanged;
  - a real browser JPEG with injected EXIF stored metadata-free at 1920×320;
  - usage grew by exactly the stored bytes (35,499) and returned to exactly 105,320;
  - DRAFT, PRIVATE (three identical, non-cache-busted requests, `cf-cache-status: BYPASS`), unattached and replaced Banners were refused through the RLS endpoint;
  - the public-bucket URL was refused;
  - the attached Banner could not be deleted through the gateway or the Storage API;
  - the Avatar upload was unchanged (8,252 bytes stored as uploaded).
- **Two failures:**
  1. A stale compare-and-set raised SQLSTATE 40001, which PostgREST returns as HTTP 504. The change was refused, but the code should be a non-40xxx error. Not fixed, because of the stop.
  2. **Stop condition.** An **anonymous visitor can create a signed URL** (`POST /storage/v1/object/sign/avatars/<path>`, expiresIn one year accepted) for an attached Banner while the GamID is PUBLIC, because the read policy grants anonymous SELECT.
     - That signed URL **kept returning 200 after the GamID became PRIVATE, and after the Banner was detached**. Only deleting the object ended it.
     - So a PRIVATE or detached Banner stays anonymously reachable to anyone who minted a link earlier.
     - By the same mechanism this likely affects every anonymous-SELECT storage policy: the public Avatar, Intro media and published Wall media. That has **not** been tested live.

**State after stop.**
- GM-TEST-01 restored: DRAFT, no Avatar, no Banner, 1 object, 105,320 bytes.
- No Banner object exists and none is attached on TESTING.
- @black and @zshot untouched: profiles not updated today; entity hashes as before.
- The migration and v6 stay deployed: with no attached Banner, nothing is currently exposed.
- No frontend change.

**Next (Mazen decides).** Phase 1B cannot pass while Storage RLS is how visitors read the Banner. A safe design needs controlled access with no anonymous SELECT on the object, for example:
- a small public Edge Function that re-checks "attached and PUBLIC" on every request and streams the bytes;
- or short server-issued signed URLs with the anonymous SELECT policy removed.

## 29. Classic Profile Banner — Phase 1C security containment and signed-URL audit — 2026-10-10

Authorized: Phase 1C only (TESTING). Product Memory ISS-0009 (HIGH, OPEN), DEC-0005. Truth unchanged.

**Containment.**
- Migration `20261010130000_profile_banner_read_containment` drops **only** the policy "public profile banners are readable".
- Kept unchanged:
  - the Banner columns and owner RPCs, and "attached banners cannot be deleted";
  - every Avatar, Intro and Wall policy;
  - usage-upload v6, quotas and limits.
- `private.banner_is_public` stays defined but is unused.
- Bucket grants were reviewed: on `storage.objects`, anon and authenticated have table privileges and RLS decides. The only permissive policies granting anon SELECT are now the three accepted ones (Avatar, Intro media, published Wall media).
- **Can a Banner become an Avatar and be read that way?** No:
  - Avatar paths cannot contain a sub-folder: `attach_avatar` and `update_my_identity_profile` both require `^uid/[a-zA-Z0-9._-]+$`.
  - Live, 0 of 3 Avatar references has a sub-folder.

**Verification.**
- **Rehearsal** in an aborted transaction, 8/8:
  - exactly one policy removed, the other 24 identical;
  - no anonymous SELECT policy mentions Banners;
  - a synthetic attached PUBLIC Banner is not visible to anon nor to another signed-in user; the owner still sees it;
  - the objects anon can see per bucket are unchanged: avatars 3, intro-media 3, wall-video 1.
- **Applied**, history repaired. The live policy diff before and after shows only that policy removed.
- **Live** with GM-TEST-01 (a synthetic Banner on a PUBLIC GamID), 18/18:
  - anonymous signing refused (1 year and 60 s → 400), and batch signing gives no URL;
  - anonymous direct read, public-bucket URL, image render and object info all 400; listing returns 0 rows;
  - GM-TEST-02 (signed in) cannot sign or read it;
  - the owner can still sign their own Banner, which is expected;
  - after removal and deletion the test link is dead.
- **Restored:** GM-TEST-01 DRAFT with 105,320 bytes; GM-TEST-02 DRAFT. No Banner object, none attached. @black and @zshot not updated.
- **Banner signed URLs from Phase 1B** were all for objects since deleted, and the probe showed 400 after deletion. No residual Banner exposure.

**Audit of the wider risk (read-only; no signed URL was created for any real user's file).** Storage signing requires SELECT under RLS and accepts any expiresIn; a signed URL survives every change except deleting the object.
- **Banner:** CONFIRMED in Phase 1B, now CONTAINED.
- **Intro media:** POSSIBLE, high likelihood.
  - The public page signs anonymously by design (`signPublicIntroMedia`, `expiresIn: Math.min(120, …)`), and the 120-second limit exists only in the browser.
  - The derivative remains when a GamID goes PRIVATE. The worker deletes a derivative only when the Intro is replaced.
- **Wall media:** POSSIBLE, high likelihood.
  - The anonymous Wall video signer (`WALL_VIDEO_URL_SECONDS = 6 h`) is browser-chosen.
  - Images and videos remain when a Wall is disabled or unpublished.
- **Avatar:** POSSIBLE, high likelihood.
  - Anonymous SELECT of the current Avatar of a PUBLIC GamID.
  - Replaced Avatars are not deleted (ISS-0008), so old links would survive.
- **NOT AFFECTED:** `intro-sources` and every owner-only read.
- Confirming these live would need synthetic GM-TEST fixtures (live writes), which needs Mazen's approval.
- There is no way to list or revoke URLs already issued (they are stateless signed tokens). Only deleting or renaming the object, or rotating the project's JWT signing secret, ends them; rotation would also affect every session.

**Proposed Banner delivery (design only, not built).** A public Edge Function `profile-banner` (`verify_jwt = false`), `GET|HEAD /functions/v1/profile-banner/<handle>`. It is addressed by handle, never by a storage path.
1. Validate the handle format, then run the rate limit.
2. Call a new **service-role-only** RPC `get_public_banner_object(handle)`. It returns the path only for a SOLO, PUBLIC GamID with an attached Banner whose object exists and carries a gateway receipt.
3. Fetch the bytes server-side with the service key (`/storage/v1/object/authenticated/avatars/<path>`). Never sign; never return a path or URL.
4. **Re-check** the same RPC after fetching, before responding, and answer only if the path is unchanged. This closes the race with a concurrent PRIVATE switch or replace.
5. Respond:
   - `200 image/jpeg`, `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, `Content-Security-Policy: default-src 'none'`, `Cross-Origin-Resource-Policy: cross-origin` (so the Cloudflare page can use it in `<img>`), `Referrer-Policy: no-referrer`, and no ETag.
   - Every refusal, whether PRIVATE, DRAFT, detached, unknown or malformed, is the same body-less `404`, so nothing can be enumerated.
6. **Abuse protection:**
   - a fixed-window counter in a private table, keyed by a SHA-256 of the client IP with a daily salt (never the raw IP), for example 120 requests per minute per IP and 600 per minute per handle, answering `429` with `Retry-After`;
   - a hard 5 MiB response cap; GET and HEAD only; a timeout on the Storage fetch.
7. **Fits the current architecture:**
   - Edge Function deployment through the CLI is proven (v6).
   - Storage stays private; there is no gateway change and no new bucket.
   - The public page would use `<img src=…/profile-banner/<handle>>`.
   - Cost: every view becomes an invocation plus egress, with no CDN caching because of `no-store`. At about 30–60 KB per Banner, that is roughly 30–60 MB per 1,000 views.

**Stop point.** Phase 1C is complete; DEC-0005 is not implemented. Next, Mazen decides:
1. whether to approve building `profile-banner` (Phase 1D);
2. whether to confirm ISS-0009 for Avatar, Intro and Wall with synthetic fixtures (live writes).

The small open issue of the compare-and-set error returning HTTP 504 (SQLSTATE 40001) remains, recorded in §28.

## 30. Phase 1D — complete remediation of visitor-minted signed URLs (ISS-0009) — 2026-10-10

Authorized: Phase 1D end-to-end (TESTING only). Product checkpoint `660d91100a78f94c86288168c279e2b536dcdb0f`. Truth: new `visitor-media-access` (PENDING_ACCEPTANCE). ISS-0009 FIXED (not VERIFIED). DEC-0005 still AUTHORIZED: the Banner UI, About Me and the desktop layout are not built.

**1. Confirmed before the fix** (GM-TEST-01 synthetic fixtures only; no real user's file was ever signed). A visitor minted a 365-day signed URL, and it kept returning 200 after:
- PRIVATE (Avatar);
- replacement (the old Avatar);
- Disable and Unpublish (Wall video; the Wall publication was a synthetic SQL row on GM-TEST-01's existing video asset);
- PRIVATE (Intro: the real pipeline, upload → pg_net → Cloud Run worker, READY in 20 s).

**2. How the fix works.** A temporary probe policy (always returning false; removed, live state back to 24 policies) showed that Storage sets `storage.operation()` to:
- `storage.object.sign` / `storage.object.sign_many` when signing;
- `storage.object.get_authenticated` / `object.get_authenticated_info` for direct reads.

So signing can be restricted without touching direct reads, which re-check RLS on every request.

**3. Implementation.**
- **Migration `20261010140000_visitor_storage_signing`:**
  - service-only `public_media_lease_allowed(bucket, path)`, built on the accepted `intro_media_is_public` / `wall_object_is_published` (Avatars and pictures are never leased);
  - `public_banner_object(handle)`: the attached JPEG of a SOLO PUBLIC GamID whose object exists;
  - a `public_media_hit` fixed-window counter, keyed only by a daily-salted SHA-256 client key;
  - Banner compare-and-set conflicts raise `PT409`, so PostgREST returns **409** (the 504 is fixed).
- **Migration `20261010141000_visitor_storage_signing_ban`:** the restrictive policy "only owners can sign storage objects", for anon and authenticated (`operation !~* 'sign'` or the folder belongs to the caller).
- Both rehearsed in one aborted transaction (9/9), applied in order, history repaired. The live policy diff shows only that one policy added.
- **Edge Functions:** `public-media` v1 and `profile-banner` v1 (`verify_jwt = false`), sharing the tested `_shared/public-media.js`.
  - `public-media`: server lifetimes Intro 120 s and Wall video 21,600 s (the accepted F5 / F4 values); CORS for the GamID site; 240 requests / min / client.
  - `profile-banner`: no-store JPEG, nosniff, CSP `default-src 'none'`, CORP cross-origin, no ETag; re-checked after the read; 120 / min / client and 600 / min / handle.
  - Both: every refusal is the same empty 404; 429 when rate limited; no service credential and no reusable Storage URL ever leaves the server.
- **Frontend** (`dist/account/supabase-client.js`): `signPublicIntroMedia` and `signPublicWallVideo` now ask `public-media`, and the page sends no lifetime. Owner signers are unchanged.
- **Deployment order:** migration A → functions → frontend (workflow [38040935387](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38040935387), stamp `660d911`, files byte-for-byte) → migration B. The public page therefore never depended on visitor signing at the moment it stopped working.

**4. Tests.**
- Full suite 1,789: 1,788 pass, 1 skip. Lint and typecheck pass.
- New: `tests/public-media.test.js` (7) and `tests/visitor-storage-signing.test.js` (7, PGlite with the real accepted Avatar policies and the Banner migrations).
- Updated: the F5 signer and F4 boundary tests, and the pinned migration list.
- **Live after the fix, 64 checks:**
  - signing refused for anon (one year, 60 s, batch) and for GM-TEST-02 on Avatar, Intro and Wall video; the owner still signs;
  - direct reads unchanged while public, refused at once on PRIVATE, Disable, Unpublish and replacement; no new lease in those cases;
  - an Intro lease is exactly 120 s and a Wall lease exactly 6 h, whatever lifetime the request asks for;
  - `public-media` refuses Avatars, Intro sources and dot segments;
  - `profile-banner`: 200 with exact bytes and headers; HEAD; 404 for PRIVATE, DRAFT, removed, unknown and malformed; replacement served at once; a stale compare-and-set returns 409; every request started after a PRIVATE switch is refused; 429 at request 121;
  - the real public page streams the Intro from a `public-media` lease (206), with no visitor signing and no page errors.
- Live fixtures: public 12/12 and Profile Editor 2/2.
- One cleanup call returned non-200, because the Intro source had already been removed by the worker.

**5. Restored.**
- GM-TEST-01: DRAFT, no Avatar, 1 object, 105,320 bytes, no Wall publication, no Intro rows, Wall draft revision 1 with the same md5.
- GM-TEST-02: DRAFT, 0 objects.
- 0 Banner objects, none attached. @black and @zshot not updated.
- The local scratch file that held fixture URLs was deleted.

**6. Residual.**
- (a) Signed URLs minted **before** the fix cannot be revoked until they expire or the object is deleted.
  - On TESTING, one test URL to GM-TEST-01's kept Wall video asset is still valid; that asset was kept on purpose, because it is listed test data.
  - Any older URLs for real users' files cannot be listed. Rotating the project JWT secret would end them all, but also every session (Mazen's decision).
- (b) Issued leases stay valid until expiry: Intro up to 120 s, Wall video up to 6 h (the accepted F4 behaviour; shortening it is a product decision).
- (c) The fix relies on Supabase setting `storage.operation()`; a periodic live signing check is recommended.
- (d) Owners can sign their own files.
- (e) `no-store` means one Edge invocation per Banner view, with no CDN caching.

STOP for Mazen's acceptance. Not started: Phase 2, the Banner editor UI, About Me and the desktop layout.

## 31. Classic Profile redesign — Phases 2-4 (Banner + About Me editor, desktop Classic Profile, validation) — 2026-10-10

Authorized: Phases 2, 3 and 4 as one task (TESTING only).
- Product checkpoints: `a116c3f79a3510b523e5adc1c9f1fb3898d41681`, then `4948f6ccc88b4cb54f5aec23e40932798df19e74` (the Usage label).
- Frontend runs: [38043009621](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38043009621) and [38043681013](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38043681013). TESTING serves `4948f6c`; files verified byte-for-byte.
- Truth: `profile-banner`, `about-me` and `classic-profile-desktop`, all PENDING_ACCEPTANCE.
- DEC-0005: IMPLEMENTED.

**Profile Editor (Phase 2).** Two new sections, Banner and About Me, each with its own Save Changes and included in Save All.
- **Banner** (`dist/account/banner-editor.js`):
  - **Accepted files:** JPEG, PNG, WebP, GIF and AVIF, recognised by their bytes; a declared type that contradicts them is refused. Size up to 5 MiB, and at most 8192 px a side / 40 MP for decoding.
  - **Animated GIF:** the first frame is used, with a note saying so. A source smaller than 1200×200 gets a soft-image note.
  - **Positioning:** a fixed 6:1 frame with drag (pointer), arrow keys and a zoom from 1 to 4.
  - **Rendering:** the browser renders 1920×320 JPEG at quality 0.9 and uploads it through the usage-upload gateway, which fully decodes it and stores its own re-encoded copy (§28).
  - **Attach / remove:** compare-and-set (a 409 shows "changed somewhere else"). The replaced or removed file is deleted, and old unattached uploads are cleaned when the section loads.
  - **Errors:** refusals stay inline until the next choice.
- **About Me** (`dist/account/about-editor.js`):
  - Location: typed text, at most 60 characters, no links or markup.
  - Languages: up to 5. Favorite Genres: up to 5.
  - One Show on my GamID switch per field, OFF by default, available only while the field has a value.
  - Member Since: read-only.
- **Migration `20261010160000_profile_about_me`** (rehearsed 6/6, applied, history repaired):
  - language list (34) and genre list (20);
  - private-by-default `profiles` columns, with a check that a switch cannot be ON without a value;
  - `get_my_about` / `set_my_about`, which validate everything on the server;
  - anonymous `get_public_profile_extras(handle)`, for PUBLIC SOLO GamIDs only: Member Since year (`entities.created_at`), whether a Banner can be delivered, and only the switched-on values. It never returns a path.
  - `get_public_identity` is unchanged.
- The Usage category is now labelled "Avatar & Banner".

**Desktop Classic Profile (Phase 3)** (`dist/public/public-desktop.js`, `public.js`, `public.css`). At 1280 px and wider, without a published, enabled Wall:
- The page draws a wide hero: Banner via `profile-banner` (gradient fallback), Avatar, name, @handle, role chips, education / work, bio, and the real game count only when My Games is public. Alongside it: About Me, My Games, and the Socials / Duo / League / Steam panel in one grid.
- The Intro frame runs in the accepted `hostReveal` mode, exactly like the Wall path: the Intro plays full-screen, its transition reveals the desktop profile, and Replay / Skip / Back are unchanged.
- Crossing 1280 px switches between the two layouts without replaying the Intro; below the breakpoint the frame redraws its accepted profile.
- The separate Discord section is hidden on desktop only. Discord appears in My Socials: the Discord Profile Card icon, or the name with CONNECTED.
- No invented data.
- `intro-preview` and `get_public_identity` are untouched.
- The accepted source-pinning tests were kept: the pinned lines remain verbatim.

**Validation (Phase 4).**
- **Automated:** full suite 1,799, 1,798 pass, 1 skip. Lint and typecheck pass.
  - New: `tests/profile-about-me.test.js` (5, PGlite with the real Banner / visitor-media migrations) and `tests/classic-profile-redesign.test.js` (5).
  - Updated: the pinned migration list.
- **Fixtures, local and `--live` against the deployed files:**
  - `scripts/public-desktop-browser.mjs` (new), 10/10: desktop at 1280, 1440 and 1920 (layout, Banner, About Me, Discord in Socials, no overflow, headings and alt text); crossing the breakpoint both ways; no Banner, refused Banner and published Wall; and mobile at 390, 768 and 1279 **pixel-identical to `660d911`** (same mocked profile, screenshots byte-equal).
  - `profile-editor-browser.mjs` 2/2: 19 sections; Banner refusals, the GIF note, drag / keys / zoom, one JPEG upload, compare-and-set, remove; About Me switches, the browser refusal and limits.
  - `public-socials` 12/12 and `wall-upload` 2/2.
- **Live on TESTING as GM-TEST-01 (real UI), 26/26:**
  - Banner: fake file and over-5 MB refusals. PNG 3000×1000, animated GIF 1500×300, WebP 2400×480 and AVIF 2400×600 each stored as a 1920×320 JPEG, with the previous one deleted and usage exactly baseline plus the current Banner.
  - About Me: private by default; saved values persist after reload.
  - Visitor desktop 1440 / 1920: the hero, the Banner (200, no-store), only the public About Me values, the frame hidden, no errors.
  - Visitor mobile 390: unchanged.
  - Intro from the real worker: on desktop it plays first and then the desktop profile shows; Replay works; mobile is unchanged.
  - Wall: published and enabled shows the Wall; disabled shows the desktop profile.
  - Privacy changes apply at once. PRIVATE gives not-found, and `profile-banner` 404.
  - Banner removal gives the gradient.
- **Restored:** GM-TEST-01 is DRAFT with no Avatar, no Banner, About Me cleared, 1 object, 105,320 bytes, no Wall publication, no Intro rows, and the draft unchanged. @black and @zshot were not touched.

**Limits.**
- About Me shows on desktop only (mobile is unchanged by decision).
- The Banner is desktop only.
- The deferred signed-URL closure review (§30 residuals) is still pending; no key was rotated.

STOP for final acceptance.

## 32. Classic Profile visual review — approved changes — 2026-10-10

Authorized: "Classic Profile Visual Review: Approved Changes" (TESTING only), starting from `4948f6c`.
- Product checkpoint: `568b5300c3849b2d0b07948989dda014355d4d9d`.
- Frontend run: [38047308404](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38047308404). TESTING serves `568b530` (Account stamp `v=568b530`); `public.js`, `public-desktop.js`, `public-games.js`, `public.css`, `about-editor.js` and `account.css` verified byte-for-byte.
- Migration `20261010180000_member_since_date`: rehearsed 7/7 in an aborted transaction, applied, history repaired.
- Truth: `about-me` (Member Since contract) and `classic-profile-desktop` (four new contracts), both still PENDING_ACCEPTANCE at `568b530`.

**Unchanged by design.** Banner and Avatar (size, crop, fallback, overlap), name alignment, the six roles (no "+3"), the bio, Intro / Replay / Skip / Back, the Wall replacing the Classic Profile, privacy, Avatar / Banner upload and security, quotas, Save Changes / Save All, and everything below 1280 px. No Favorites / Games I've Played.

**Changes.**
- **Member Since** is the full registration date. `get_my_about`, `set_my_about` and `get_public_profile_extras` gain a trailing `member_since_date` (`entities.created_at` as a UTC calendar date, `YYYY-MM-DD`; nothing else is exposed). The page shows "10 October 2026" with no Date object or time zone (`formatMemberSince`, in `about-editor.js`), so every visitor sees the same day. It is read-only. The year column stays; the page falls back to it only if a server sends no date. The `set_my_about_impl` body, the extras' privacy rules and every grant are word-for-word the accepted ones (tested).
- **Games counter**: the same stat, now `a.desk-stat` → `#publicGames`. Smooth scroll (instant with reduced motion); focus moves to My Games (`tabindex=-1`); aria-label "N games - go to My Games"; visible focus ring. The count is the authoritative public `library_count`.
- **About Me checkboxes**: root cause is the global `input,select{display:block;width:100%;padding;min-height:3rem}` rule in `account.css`, which turned each chip's checkbox into a large white square. `.about-chip input[type=checkbox]` now resets it to one 16 px native box (`flex:0 0 auto`). Long labels wrap beside it. The 5 + 5 maximum is unchanged. Also fixed: each toggle rebuilt the chips and dropped keyboard focus to the page; focus now stays on the toggled chip. The fix applies wherever the editor is used.
- **My Games**: each row gets a 56 px tile before the title / year / Manual-source badges. The chevron stays, because Game Details is a real destination. 6 rows, View all unchanged. Desktop only (`.game-thumb` is hidden unless `html.is-public-desktop .public-games`).
- **League**: a 50 px tile beside the card's text (absolutely positioned at the content top, so the card structure is unchanged). Desktop only.
- **Artwork: BLOCKED (product decision needed).** No approved source exists:
  - the accepted `public_my_games` contract sends no Steam app id or icon;
  - Steam icon hashes are private in `discovered_games`;
  - manual games have no image;
  - the game-logos backlog has not started;
  - League has only `profile_icon_id` (Riot Data Dragon would be a new provider).

  So every tile is the fallback: the title's initials (`data-initials`, drawn by CSS, so no text is added to rows or cards) on one of six neutral tones chosen deterministically from the title. Nothing was downloaded, fetched, matched or guessed, and no service was added.
- **My Socials**: Discord and Instagram show their marks, as static white CSS masks (Discord = the simple-icons path, CC0; Instagram = a camera glyph drawn from a rounded square, a ring and a dot). Badge size, colours, placement, links and aria-labels are unchanged. Desktop-scoped, so the mobile badges keep "DC" / "IG". The independent mobile Discord section is untouched.
- **My Duo**: no change needed. Verified: the card opens the Duo's GamID (with Back), keyboard Enter works, a 60-character name wraps inside the card, and the data is real (`public_sections.duo`).
- **MY CREW** (`crewSection` in `public-desktop.js`): beneath My Duo in the desktop sidebar, one card per Crew in the server's `public_sections.crews` (20261003234309: PUBLIC GamID, ACTIVE membership, Crew Wall PUBLISHED; ordered by game, game_key, crew_id). The selection rule is the existing one: all listed Crews, in that order, no primary Crew. Each card reuses the Duo card's classes and opens `/crew/?c=<id>&from=<handle>` (`crewWallHref`). The public section has no Crew image, so a card shows the initial. Hidden when nothing is listed. The block is `.desk-only` inside the sections panel, which a published Wall hides. A panel holding only My Crew shows on desktop only (`hasDeskSide`), including when the width crosses the breakpoint.
  - `tests/wall-crews-block.test.js` §9 originally forbade any crew rendering in `public.js`; it encoded the a3c0ae4 correction (no fixed MY CREW section *below the Wall*). It now asserts that rule exactly: no section below the Wall, a published Wall hides the panel, and the only crew rendering is this desktop-only card.

**Validation.**
- **Automated:** suite 1,810 (1,809 pass, 1 skip); lint, typecheck and `npm run build` pass.
  - New: `tests/classic-profile-visual-review.test.js` (11):
    - the migration in PGlite on top of the real About Me migrations (UTC date under Honolulu / Riyadh / Kiritimati session time zones, privacy, grants, the unchanged `set_my_about` body);
    - `formatMemberSince`;
    - the counter;
    - MY CREW (order, links, initial, malformed rows, panel rules);
    - tiles, socials marks and checkboxes.
  - Updated: the pinned migration list, the League renderer harness (its one import) and the crew guard above.
- **Fixtures** (local and `--live` against the deployed files):
  - `public-desktop-browser.mjs` 14/14 at 1280, 1440 and 1920:
    - full content with a Banner, the Duo + 2 Crews, the counter (keyboard Enter → My Games focused), 56 px tiles, the League tile, Discord / Instagram marks;
    - maximum content at 1280 / 1920: 60-character Location, 5 + 5 long labels, a 60-character Duo name, a 40-character Crew name, with no overflow or collision;
    - some-private and Crew-only panels (hidden below 1280; the card opens the Crew Wall);
    - plain, refused Banner and published Wall;
    - mobile at 390 / 768 / 1279 **pixel-identical to `4948f6c`** with the Duo and Crew data present.
  - `profile-editor-browser.mjs` 2/2 (1280, 390): 12 checkboxes all 16×16 inside their chips; a long label wraps without resizing its box; Space toggles and keeps focus.
- **Live on TESTING, GM-TEST-01 / GM-TEST-02 (real UI), 44/44:**
  - Owner:
    - a real Avatar (upload, crop, Save) and Banner through the editor;
    - all 54 About Me checkboxes 16×16; at the maximum, 10 checked and 44 disabled;
    - Space keeps focus;
    - 60-character Location and 5 + 5 public;
    - Member Since "4 October 2026" (`created_at` 2026-10-04).
  - Setup: two fictional social links, 7 manual games with My Games public, a Duo with GM-TEST-02, and a Crew with a published Crew Wall.
  - Visitor at 1280 / 1440 / 1920:
    - the real Banner and Avatar;
    - About Me: Location, Member Since 4 October 2026, 5 languages and 5 genres, with no clipping or collision;
    - counter "7 Games" linking to My Games, with keyboard Enter scrolling and focusing, and a visible 2 px ring;
    - 6 tiles, View all 7, Manual kept;
    - static marks;
    - the Duo card opens `/@gm_test_02` with Back;
    - the Crew card opens that Crew Wall.
  - Visitor at 390 / 768 / 1279: the accepted layout (no hero, About Me, Crew card, tiles or marks; the text badges stay).
  - Privacy: some-private and all-private show only what the server sends; an unpublished Crew Wall removes the card.
  - Intro from the real worker: first, then the desktop profile; Replay; mobile unchanged.
  - A published Wall still replaces everything.
- **Restored exactly:**
  - Both personas: DRAFT, no Avatar / Banner / About Me / socials / manual games / Duo / Crew / Intro rows, notifications back to 6 each, Wall draft unchanged (rev 1, same md5), My Games private.
  - GM-TEST-01: 1 object, 105,320 bytes. GM-TEST-02: 0 objects, 0 bytes.
  - One earlier run's restore left a detached Banner object; it was deleted by owner DELETE and the restore now deletes it directly.
  - @black and @zshot were not touched.

**Open.**
- The game / League artwork source is a product decision (above).
- The deferred signed-URL closure review (§30 residuals) is still open and is **not** closed by this task; no key was rotated.

STOP for visual acceptance.

## 33. Classic Profile desktop consolidated update — 2026-10-11

Authorized: "GamID — Classic Profile Desktop Consolidated Update" (TESTING only).
- Product checkpoint: `0ccf1c721b9e844ce88ba69c6010cc2ab392c706`.
- Frontend run: [38105792369](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38105792369). TESTING serves `0ccf1c7`; 13 changed files verified byte-for-byte.
- Migration `20261011100000_classic_profile_consolidated`: rehearsed 10/10 in an aborted transaction, applied, history repaired.
- GeoNames catalog loaded: 252 countries, 34,156 cities.
- Edge Function `game-artwork` deployed (verify_jwt off).
- Truth:
  - `about-me` and `classic-profile-desktop` updated;
  - new `my-crews-view` and `game-artwork-provisional`;
  - all PENDING_ACCEPTANCE.

**Decisions taken with Mazen at the start (2026-10-11):**
- **Location data:** GeoNames cities15000 + countryInfo (CC BY 4.0; download approved).
- **SteamGridDB:** build it, off until Mazen sets the key.
- **Crew limit:** 10 ACTIVE memberships, owned + joined.
- **My Crews:** a full-screen panel with PUBLIC member avatars.
- **@black's legacy Location** ("Jeddah Saudi Arabia", the only one on TESTING) is left untouched; no data of @black / @zshot was changed.

**Audit before implementation:**
- Crews: TESTING has 1 Crew and 2 ACTIVE memberships (largest per GamID: 1), no INVITED rows. The schema already allows one ACTIVE Crew per game. The ten-Crew limit therefore conflicts with no existing record.
- Linked game accounts: League only (3 profiles); `game_profiles` is empty.
- Catalog ids: Steam app ids for 7,559 of 27,182 games, plus IGDB / Wikidata / Epic. 45 of the 82 Steam-discovered games map to the catalog.
- No Crew directory route existed.

**Changes.**
1. **Favorite Genres.**
   - Server: the five-genre check and the `profiles_about_genres_check` (≤5) are gone (a defensive ceiling of 64 remains). Values are still catalog-validated with no duplicates; Languages stay ≤5.
   - Editor: no genre is ever disabled; the hint reads "N selected … Your public profile shows five."
   - Public desktop: shows at most five (`PUBLIC_GENRES_SHOWN`). The server returns all of them.
   - Play Together matching is untouched (it never used genres).
2. **Location.**
   - Catalog tables `location_countries` / `location_cities`, loaded through `private.import_location_batch` from `scripts/location/geonames-import.mjs` (docs/LOCATION-DATA.md: source, hashes, licence, limits).
   - `profiles.about_country_code` (ISO) and `about_city_id` (GeoNames id, composite foreign key to its country).
   - Editor (`about-editor.js` + `location.js`): two accessible comboboxes (ARIA 1.2 pattern, keyboard / mouse / touch).
     - Country search in English or Arabic (Arabic names from the browser's `Intl.DisplayNames`).
     - City search on the server, limited to the chosen country: `search_location_cities`, authenticated, 12 most populous.
     - "Clear location" and the GeoNames attribution.
   - Public: formatted "City, Country" only while the switch is ON.
   - Legacy text: kept in `about_location`, still shown, never converted.
     - `get_my_about` offers `location_suggestion` only for an unambiguous match (longest country name; exactly one city).
     - Choosing a place (or the suggestion) replaces it on Save Changes. No GPS.
3. **Connected Games** (`connectedGamesSection`, desktop main column under About Me, left of My Games).
   - Content: the League account's identity, rank line (only while stats are public), PROTOTYPE / UNVERIFIED and its data source.
   - Destination: it opens the same League Game Details My Games opens, only when My Games lists League (looked up in the preview, otherwise one library search after the Intro starts). Otherwise it is not a button.
   - View all after 3 opens a full-screen list.
   - The League card is hidden from the desktop sidebar only; mobile keeps it.
   - No new game integration.
4. **My Crews.**
   - The sidebar holds one fixed entry (`crewsEntry`): "MY CREWS", count and games. It opens a read-only full-screen view (`crews-directory.js` on `profile-panel.js`, the My Games dialog styles: role=dialog, Escape, focus return, Tab trap).
   - The view has large cards per Crew from the anonymous `get_public_crews(handle)`:
     - the same Crews and order as the public section;
     - each card holds a game background, game icon, name, game, member count and up to 5 PUBLIC member avatars; non-public members are counted, never shown;
     - each card links to the existing Crew Wall.
   - A failed read keeps the section's Crews.
   - **Limit:** `private.crew_policy.max_memberships_per_identity = 10`, checked with a per-GamID advisory lock in `create_crew_impl` and `respond_to_crew_invite_impl` (CREW_LIMIT_REACHED; bodies otherwise identical).
5. **Artwork (provisional SteamGridDB evaluation).** See docs/GAME-ARTWORK-STEAMGRIDDB.md.
   - `game-artwork` Edge Function plus service-only `game_artwork_targets` / `_cache_get` / `_cache_put`.
   - Exact Steam-id match, or exactly one same-title + same-year search result; otherwise NO_MATCH.
   - Static, non-NSFW images; provider-CDN URLs only (also a database CHECK).
   - Metadata-only cache (7 days); 6 lookups per request with a 4 s timeout; stops on timeout / 429 / 401 / 5xx; 30 requests per minute per client.
   - Kill switch: `private.game_artwork_settings.enabled`.
   - The page lays images over the initials tiles (no referrer); a Crew card gets a background layer over its gradient. Desktop only.
   - **The secret `STEAMGRIDDB_API_KEY` is not set**, so on TESTING the function returns `configured:false` and no provider request is made.
6. **Visitor vs owner.** The public modules create no inputs, switches or save actions (tested). The live public page shows none for visitors. Owner editing stays in the Profile Editor.

**Validation.**
- **Automated:** suite 1,829 (1,828 pass, 1 skip); lint, typecheck and build pass.
  - New: `tests/classic-profile-consolidated.test.js` (19), including:
    - PGlite runs of the migration: genres, Location and legacy suggestions, the ten-Crew limit, `get_public_crews` privacy, artwork RPC grants and CDN check;
    - the Edge Function against a mocked provider: Steam-id and title+year matches, similar title, wrong year, ambiguous, no images, timeout / 429 / 503 / 401, no key, disabled, rate limit, bad handle, foreign origin, duplicate titles;
    - page artwork placement and failure, the My Crews view and Connected Games;
    - search normalization and the GeoNames parser;
    - no editing controls in public modules.
  - Updated: the About rules test, the visual-review tests (one My Crews entry), the crew guard (`wall-crews-block`), and the pinned migration list.
- **Fixtures** (local; desktop also against the deployed files): `public-desktop-browser.mjs` 15/15.
  - Desktop 1280 / 1440 / 1920 with mocked artwork: images only on reliable matches; Connected Games placement and its Game Details; the My Crews view (links, counts, background layer covering the card, Escape / focus); genres capped at five; no editing controls.
  - Long content, privacy, Crew-only and breakpoint-crossing scenarios.
  - Artwork failure (503): initials everywhere, no errors.
  - Published Wall.
  - Mobile 390 / 768 / 1279 **pixel-identical to `568b530`**, with no artwork request.
- **Editor fixture:** `profile-editor-browser.mjs` 2/2 (1280, 390):
  - legacy note and suggestion;
  - Arabic country search;
  - a city of that country only;
  - six genres, none disabled;
  - compact checkboxes, Space keeps focus;
  - the new `set_my_about` payload.
- **Live on TESTING, 37/37** (GM-TEST-01 / GM-TEST-02, real UI):
  - Owner:
    - a real Avatar and Banner;
    - the legacy text shown with its suggestion;
    - Saudi Arabia found by its Arabic name, Jeddah by "jed" and by "جدة" (live catalog);
    - 8 genres persisted after refresh;
    - the legacy text replaced only by the owner's choice.
  - Crew limit: 10 created and the 11th refused (CREW_LIMIT_REACHED); all removed afterwards.
  - Visitor at 1280 / 1440 / 1920:
    - Location "Jeddah, Saudi Arabia", 5 of 8 genres;
    - one "2 Crews" entry; the My Crews view with two cards, counts and the owner's Avatar; Escape / focus; a card opens its Crew Wall;
    - no artwork and no provider request (not configured);
    - no editing control.
  - Visitor at 390 / 768 / 1279: unchanged, no artwork request.
  - **@black, read-only visit, DOM checks only, no screenshot:** League in Connected Games (identity and PROTOTYPE / UNVERIFIED), absent from the sidebar, opening its Game Details. @zshot has a published Wall, so Connected Games is not applicable.
  - Privacy (Location OFF).
  - Intro from the real worker (27 s), then Replay.
  - A published Wall still replaces everything.
  - @black's data unchanged.
- **Restored exactly:**
  - Both personas: DRAFT; no Avatar, Banner, About Me, Location, socials, manual games, Duo, Crews, Intro or Wall rows; notifications at 6 each; Wall draft unchanged; My Games private.
  - GM-TEST-01: 1 object, 105,320 bytes. GM-TEST-02: 0 objects, 0 bytes.

**Open / blocked.**
- **SteamGridDB is not yet evaluated live.** It needs Mazen to create a personal key and set `STEAMGRIDDB_API_KEY`; coverage and mismatch measurements on real data follow then. Licensing questions are in docs/GAME-ARTWORK-STEAMGRIDDB.md: the terms describe personal, non-commercial use, and artists' and publishers' rights are unconfirmed. No rollout beyond TESTING evaluation.
- @black's free-text Location stays as is until Mazen picks a country in the editor (the suggestion "Jeddah, Saudi Arabia" is offered).
- Location limits:
  - only cities of 15,000+ inhabitants;
  - same-named cities in one country are told apart only by population order;
  - `name_ar` can be a Persian or Urdu spelling (search hint only).
- The deferred signed-URL closure review (§30 residuals) is still open and was not touched; no key was rotated.

STOP for owner acceptance.

## 34. Classic Profile — SteamGridDB artwork live evaluation + all public Favorite Genres — 2026-10-11

Authorized: "GamID — Classic Profile: Game Artwork + Favorite Genres" (TESTING only).
- Product checkpoint: `70f8940817aec80f07aee2fc95bad58fbe66f297`.
- Frontend run: [38107998065](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38107998065). TESTING serves `70f8940`; changed files verified.
- Migration `20261011140000_artwork_evaluation_allowlist`: rehearsed, applied, history repaired.
- `game-artwork` redeployed.
- Truth: `about-me` (genres contract) and `game-artwork-provisional` (terms + allowlist), both PENDING_ACCEPTANCE.

**Provider terms.** Full findings and the permission request draft are in docs/GAME-ARTWORK-STEAMGRIDDB.md.
- The official API reference (OpenAPI v2.10.0) states Bearer auth only: no rate limit, cache, licence or API terms.
- The Terms of Use restrict use to personal, non-commercial use, forbid automated use, and forbid distributing any part of the service without explicit written permission.
- Mazen chose (2026-10-11) a live evaluation on the test personas only.
- So migration `20261011140000` adds `evaluation_handles` (`gm_test_01`, `gm_test_02`): `game_artwork_targets` is enabled only for those. @black and @zshot receive `enabled:false` and no artwork.
- **Public activation stays BLOCKED until SteamGridDB grants written permission.**

**Configuration.** The function reports `configured:true` (it sees the new secret; its value was never read or printed). Kill switch ON.

**Code changes.**
- `game-artwork`: a malformed 200 (not JSON, or not `{ success: true, data }`) is a provider fault — stop and cache nothing — instead of a cached NO_MATCH. Icons are requested as PNG.
- **Favorite Genres** (owner decision): `public-desktop.js` draws every public genre in the owner's order. The `.desk-chips` flex-wrap wraps them inside About Me; no `slice`, +N or ellipsis. The editor hint no longer mentions five. Mobile is untouched.

**Live SteamGridDB evaluation (GM-TEST-01; 16 games, 3 Crews), 13/13 checks.**
- Resolved in 3 requests (6 lookups each at most).
- **15 matched** (12 by Steam id; Fortnite, League of Legends and Valorant by exact title + year); **1 fallback** (Minecraft, no unique title + year match).
- **33/33 images loaded** in a real browser.
- A visual check of every image: all correct. *Doom* shows "DOOM I+II" because Steam app 2280 is now the combined product.
- My Games: 6/6 preview rows with artwork, and Game Details still opens.
- My Crews: 3/3 backgrounds.
- Connected Games: none on the test persona (no fabricated account).
- Cache hit with no provider call (0.4 s).
- Allowlist: @black gets nothing.
- Kill switch OFF / ON.
- Request limit: 429 at the 27th request in a minute.
- GM-TEST-01 restored exactly. The 16 metadata cache rows are kept (evaluation results, not user data).

**Favorite Genres live, 11/11.**
- Editor: 12 genres saved and kept after refresh in the owner's order; the hint reads "12 selected · …".
- Visitor views with 0, 1, 5, 9 and 12 genres (12 at 1280, 1440 and 1920): every one shown in order, inside a visible About Me card, with no +N or ellipsis, no overlap with My Games / Connected Games, and no horizontal scroll.
- Visibility OFF: nothing on the page or in the anonymous response.
- **@black, read-only visit, About Me card only:** all 9 of his genres shown in his order, wrapping over 3 lines.
- GM-TEST-01 restored.

**Automated.**
- Suite 1,830 (1,829 pass, 1 skip); lint, typecheck and build pass.
- `tests/classic-profile-consolidated.test.js` 20 tests, including genres at 0/1/5/9/12, the allowlist in PGlite, and malformed provider responses.
- Fixtures: desktop 15/15 (12 long genres wrap inside About Me at 1280 and 1920; all 7 shown in order); mobile 390 / 768 / 1279 pixel-identical to the `568b530` baseline; editor 2/2.

**Open.**
- Written permission from SteamGridDB (draft in the doc) before any display on real profiles or a public / commercial release.
- Connected Games artwork on a real linked account is verified only by fixture; it is outside the allowlist.
- The signed-URL closure review (§30 residuals) is still open.

STOP for owner acceptance.

## 35. Game artwork for every TESTING account — 2026-10-11

Owner directive (Mazen): artwork for ALL TESTING accounts, @black included; no per-account restriction.
- Product checkpoint: `e2bfb5102d578c4167f0114eb7be122d485ab09a`.
- Frontend run: [38109333605](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38109333605); stamp `e2bfb51` (no frontend file changed).
- Migration `20261011160000_artwork_environment_wide`: rehearsed (black / zshot / gm_test_01 all `enabled:true`, column gone), applied, history repaired.

**Change.**
- `game_artwork_targets` is gated only by the TESTING-wide `private.game_artwork_settings.enabled` (the kill switch). `evaluation_handles` is dropped, and no account is hardcoded.
- Unchanged: matching (exact Steam id, strict title + year), cache, rate limits, CDN checks, the server-side key, and the fallbacks.

**Verified.**
- Suite 1,830 (1,829 pass, 1 skip); build passes.
- Live, function responses only (counts):
  - @black: 9 games with artwork, including League (Connected Games).
  - @zshot: 28 after 4 requests (6 lookups per request).
  - No non-CDN URL; no key, Bearer or API path in any response.
- No frontend change, so desktop / mobile behaviour, Favorite Genres, My Crews and Connected Games are unchanged.
- No screenshots were taken (owner instruction); visual review is Mazen's.

**Open.** SteamGridDB's written permission for distribution / commercial use is still not obtained (draft request in docs/GAME-ARTWORK-STEAMGRIDDB.md). There is no Production / public release. The signed-URL closure review is still open.

STOP for owner review.

## 36. Favorite Games + My Games / Connections Settings separation + View All artwork — 2026-10-11

Owner directive (Mazen): implement and deploy to TESTING **without running any test**.
- Product checkpoint: `6ab062e024926c6c5a3d2bea63265d1147b9935a`.
- Migration `20261011180000_favorite_games`: applied on TESTING, history repaired.
- Edge Function `game-artwork`: deployed.
- **Frontend deployment to TESTING: NOT performed.** The TESTING workflow (`deploy-cloudflare-testing.yml`) runs `npm run build`, which includes the full test suite. Running it would contradict the owner's no-test instruction, and skipping it would bypass a required gate. So TESTING still serves `e2bfb51` until Mazen authorizes that workflow, or runs it himself.
- Truth: new `favorite-games` PENDING_ACCEPTANCE.

**Changes.**
- **Settings:** `#myGamesSection` and `#gameDisplaySection` moved out of the Connections card. They are now independent Profile Editor cards right after Connections; League stays in Connections. No function changed.
- **Favorites (backend):**
  - `profiles.favorite_games text[]` (≤3).
  - `get_my_favorite_games` / `set_my_favorite_games`: owner only, own library keys only, no duplicates, `FAVORITE_GAMES_LIMIT`.
  - Delete triggers on `entity_game_platforms` / `discovered_games` prune favorites that left My Games.
  - Anonymous `get_public_favorite_games(handle)`: PUBLIC GamID with public My Games, in order.
- **Favorites (editor):** a heart (♡ / ❤️, `aria-pressed`) on every library row with a catalog key, saved at once. A fourth heart shows "Maximum 3 favorite games. Remove one to add another." in the My Games status line.
- **Favorites (public):** `favoriteGamesSection` (desktop) — a `favs` grid row below the hero (beside the sidebar) with up to 3 portrait covers (2:3) and names below. It is hidden with no favorites, and a card opens Game Details (preview, else one library search). The mobile profile is unchanged.
- **Artwork:**
  - The cache gains `cover_url` / `cover_checked`.
  - Favorites join `game_artwork_targets` (purpose `favorites`, resolved first).
  - The function fetches a portrait grid (600x900 family) only for favorites, and only the cover for an already-cached match. The page fills `[data-game-cover]` with a cover only.
- **View All Games:** the library list has `data-artwork-scope` and an `onRowsRendered` hook. On desktop its rows show the same cached tiles (lazy images, no new provider).

**Tests were not run, as instructed by the owner.** Two pinned assertions were updated to the new structure (`manual-games.test.js` My Games outside Connections; `public-my-games.test.js` migration list) but not executed.

STOP for owner review.

**Deployment (2026-10-11, owner-authorized).** Mazen authorized running the mandatory CI gate once. Workflow run [38113520035](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38113520035) from a temporary ref at exactly `6ab062e` (`feature/deploy-6ab062e`, deleted afterwards): the complete project validation (lint, typecheck, full test suite) passed on its first run; deployment and smoke checks succeeded. TESTING serves `6ab062e`. No other test, browser journey or screenshot was run.

## 37. Two-column Classic Profile, Gaming Roles in 8 categories + Suggest a Role, 4 Favorite Games, Crew header game logo — 2026-10-11

Owner-authorized implementation (Mazen), TESTING only. All new work is PENDING_ACCEPTANCE.
- Product checkpoint: `506bfa7a150c02234101e099ebc1538e73e35f3c` (implementation `66e431a` + CSS placement fix `506bfa7`), branch `feature/play-together-notifications`.
- Migration `20261011200000_roles_favorites_crews`: rehearsed in a rolled-back transaction (8 categories, 71 roles, 0 uncategorized, the 9 existing role selections kept, 1 administrator, 3 notification types), then applied on TESTING; history repaired.
- Edge Function `game-artwork`: deployed (new Crew route answers 200).
- Frontend: workflow run [38125086921](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38125086921), source = branch head `506bfa7`, complete project validation passed; `/account/` stamp `v=506bfa7`. The first run ([38124924973](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38124924973), `66e431a`) failed one CSS-scope guard (`steam-connection.test.js`: the new role styles sat inside the Steam-scoped block); fixed by moving them before it.

**Changes.**
- **Desktop Classic Profile (`public.js`, `public.css`):** two independent columns, `minmax(0,1.75fr) minmax(19rem,1fr)`. LEFT `.desk-col-left`: hero, Favorite Games, My Games. RIGHT `.desk-col-right`: About Me, the My Socials / My Duo / My Crews panel, Connected Games. Each column is its own grid (`align-content:start`), so there are no shared row heights. Below 1280px `restoreMobileOrder()` returns the panel and My Games to the accepted mobile order; the columns are `display:none` there.
- **Gaming Roles (migration):**
  - `gaming_role_categories` (8 rows, read through `get_gaming_role_categories()`, anon + authenticated).
  - `gaming_role_catalog.category_key`; 71 roles in the approved order (sort 101..809).
  - The 12 original keys are kept; 8 are relabelled (e.g. `coach` = Gaming Coach, `developer` = Game Developer). No selection is touched, and there is no second catalog.
  - The owner's instruction says 77 roles; the list it contains has 71, and exactly those are implemented.
- **Editor (`account.js`, `account.css`):**
  - each category is an expandable group (title, description, "N roles · M selected");
  - checkboxes across categories;
  - one Primary Role, moved when it is deselected;
  - a Selected roles area with removable chips and Clear All;
  - existing Save / dirty state / Live Preview paths unchanged.
- **Badges:** the desktop hero already used individual badges; the profile frame (`intro-preview.js`) now renders each secondary role as its own `.preview-role` chip instead of one joined text.
- **Suggest a Role:**
  - `suggest_gaming_role` (authenticated): whitespace normalised, 3–40 characters, letters required, no links / markup (`INVALID_ROLE_NAME`);
  - exact / near catalog duplicates are refused (`ROLE_ALREADY_EXISTS`; compares compact names and a core with the Gaming / Game / Esports prefix and plural removed);
  - so are the same user's pending repeat (`ROLE_SUGGESTION_DUPLICATE`) and more than 5 in 24 h (`ROLE_SUGGESTION_RATE_LIMIT`);
  - each suggestion is stored PENDING in `gaming_role_suggestions` (RLS, no table grants);
  - administrators are notified via `private.notify` (`role.suggestion_submitted`);
  - the owner sees a confirmation and their recent suggestions (`get_my_role_suggestions`).
- **Admin review:**
  - administrators are `private.gamid_admins` / `private.is_gamid_admin()`, seeded with the owner account of @black as the TESTING administrator;
  - `get_my_admin_status`, `list_role_suggestions` and `review_role_suggestion` raise `ADMIN_ONLY` for anyone else;
  - a hidden-by-default Role Suggestions card (`#roleSuggestionsSection`) is shown only when the server says admin;
  - Approve takes a category plus an optional final name (duplicate-checked), creates a stable slug key, and resolves same-name pending suggestions;
  - Reject closes the suggestion;
  - submitters are notified (`role.suggestion_approved` / `role.suggestion_rejected`; destinations `account.gaming_roles`, `account.role_suggestions`).
- **Favorite Games: 4.**
  - `profiles_favorite_games_check` ≤ 4 and `set_my_favorite_games_impl` limit 4.
  - Editor: "Maximum 4 favorite games. Remove one to add another."; the error check also reads the message, since `code` is the SQLSTATE.
  - Public: four covers in one row (`FAVORITE_GAMES_SHOWN = 4`).
- **Crew header logo:**
  - `public.game_artwork_crew_targets(crew)` (service_role only): the game of a Crew whose Crew Wall is PUBLISHED.
  - The function route `/game-artwork/crew/<uuid>`.
  - `crew-wall.js` adds `span.crew-title-logo` (initials, artwork laid over).
  - `crew.js` makes one `fetchCrewArtwork` request per page load.
- **My Crews cards:** the existing rich cards (`crews-directory.js`: artwork background, game icon, name, game, count, public avatars, opening the Crew Wall) are unchanged and meet the request.
- **Settings:** Connections, My Games and Game Display remain independent cards (§36). Education & Work is unchanged.

**Tests.**
- New `tests/gaming-roles-favorites-crews.test.js` (7 tests, PGlite + source): catalog, suggestions, admin-only review, favorites 4, Crew route, two columns, editor / badges.
- Pinned lists updated in `notifications.test.js` (destinations) and `public-my-games.test.js` (migration list).
- The related test files were run locally, then the mandatory CI. No browser journey, no screenshots.

STOP for owner acceptance.

## 38. ISS-0007 Avatar validation, ISS-0009 closure assessment, CP-01 My Crews sizing, GR-01 Role Suggestions placement — 2026-10-11

Owner-authorized combined task (Mazen), TESTING only. Product checkpoint `a1d2eebd5355f8c2ad9c4d7d398348fa0d167cc7` on `feature/play-together-notifications`.
- Frontend: workflow run [38128281601](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38128281601); complete project validation passed on its first run; `/account/` stamp `v=a1d2eeb`. The removed card, the JPEG-only cropper and the new Crew grid rule were confirmed in the served files.
- Edge Function `usage-upload` v8; its downloaded deployed source is byte-identical to the repo. An unauthenticated Avatar POST returns 401.
- Migration `20261011220000_avatar_validated_attach`:
  - rehearsed in a rolled-back transaction: the 3 attached Avatars stay attached and publicly readable, 0 earlier objects are attachable, the helper has no client grant, and the existing grants are kept;
  - applied after the gateway deploy (cutoff `validated_since` = 2026-10-11 09:23:17 UTC); history repaired.
- Deployment order: gateway → migration → frontend. Between the gateway and the frontend deploy (a few minutes), the old page's WebP Avatar uploads would have been refused.

**ISS-0007 (FIXED, not VERIFIED).**
- **Gateway:**
  - `usage-upload.js` shares one strict JPEG decode / re-encode (`reencodeJpeg`) between Banner (unchanged behaviour and codes) and Avatar (`processAvatar`).
  - An Avatar must be a direct POST to `<uid>/avatar-<uuid>.jpg` of a JPEG (declared and real) with a square 16–1024 px frame, read before decoding. It must decode in jpeg-js strict mode (≤ 1.1 MP, 32 MB) with an end-of-image marker.
  - The gateway stores its own re-encoded JPEG (quality 90) as `image/jpeg`, and the reserved size is the stored size.
  - Every refusal comes before any reservation or write.
  - Deleting an older Avatar (any name) is unchanged.
- **Resumable route:** TUS creation into `avatars` and PATCH on an `avatars` receipt are refused with `AVATAR_REQUIRES_DIRECT_UPLOAD`. There were 0 such receipts on TESTING. Other buckets are unchanged.
- **Reference rule:**
  - `private.avatar_attachable(owner, path)` (no client grant): `<owner>/avatar-<uuid>.jpg`, `image/jpeg`, owned by the caller (owner_id or a COMPLETE receipt), stored at or after the cutoff.
  - `attach_avatar_impl` (which previously didn't check that the object existed) and `update_my_identity_profile_impl` (the live definition with only its Avatar check replaced) require that rule for a new reference. The current reference may be kept.
  - No stored object, policy or quota changed.
- **Browser:**
  - `createNormalizedAvatar` exports JPEG (.92) only; `AVATAR_MIN_OUTPUT = 16`.
  - Onboarding passes the chosen file through `normalizeAvatarFile`: the cropper's centred square.
  - `uploadAvatar` sends only `image/jpeg` to a `.jpg` path.
  - New gateway codes have messages in `domain.js`.
- **Also:** `worker/usage-smoke.mjs` moved its byte-accounting probe from `avatars` to `wall-media` (4 raw bytes are no longer a valid Avatar).
- **Not done live:** an authenticated Avatar upload; it needs a persona sign-in, which the agent does not perform. Mazen's own Avatar change is the remaining check.

**ISS-0009 (still FIXED, not VERIFIED; residual risk for Mazen's decision).**
- **Configuration, read live:** migrations `20261010140000` / `141000` applied; the restrictive "only owners can sign storage objects" policy; no public bucket; the lease, Banner and counter RPCs have no client grant. `public-media` v2 and its shared module were downloaded and are byte-identical to the repo: Intro 120 s, Wall video 21,600 s.
- **Rolled-back RLS simulation (counts only):** anonymous and signed-in non-owner callers see the public objects for direct reads (3 Avatars, 3 Intros, 1 Wall video) and 0 for `storage.object.sign` / `sign_many`.
- **Live probe through the real Storage API and `public-media`.**
  - Fixtures: GM-TEST-01 only, temporarily PUBLIC, with a synthetic 64 px Avatar and a synthetic Wall publication of its existing synthetic video. Anonymous requests used only the publishable key; no URL or token was printed.
  - Results:
    - Avatar: direct read 206; sign 365 d → 400 and 60 s → 400; `sign_many` returned no URL; lease 404.
    - Wall video: direct read 206; sign 365 d → 400; `sign_many` returned no URL; lease 200 at exactly 21,600 s (token exp − iat 21,600) although 365 d was asked.
    - Intro lease for a non-public path: 404.
    - Detached Avatar: read 400. PRIVATE: Avatar read 400, Wall read 400, lease 404. Disabled: Wall read 400, lease 404, while the lease issued earlier still answered 206 (the accepted F4 behaviour). Unpublished: Wall read 400, lease 404.
  - Restored: GM-TEST-01 DRAFT, no Avatar, 0 publications, 1 object (105,320 bytes); the synthetic Avatar object was removed. No real user's file was read, signed or changed.
- **S3-compatible access:** reached only with a user session JWT as the session token (the site's key is `sb_publishable_`, not a JWT). Its requests run under the same RLS with the caller's role, checked on each request, and the session expires within about an hour. It is not an equivalent long-lived bypass by analysis. Not tested live, because that needs a signed-in account; any S3 access keys are project-level secrets, not a visitor path.
- **Historical URLs:**
  - The known pre-fix synthetic test URL (365 days, minted 2026-10-10) is **not expired** (until about 2027-10-10); its object, GM-TEST-01's synthetic Wall video, still exists. Deleting that synthetic object (Mazen's authorization required) would end it without rotation.
  - URLs made by the normal pre-fix page were short (Intro ≤ 120 s, Wall video ≤ 6 h) and have expired. Any long URL a visitor deliberately minted before 2026-10-10 for a then-public object cannot be listed or revoked without rotating the JWT secret (not done; Mazen's decision). No evidence either way is available.

**CP-01.**
- `.crew-grid` tracks are `repeat(var(--crew-cols), minmax(0,19rem))`, centred. `crews-directory.js` sets `data-count = min(Crews, 3)`.
- The panel uses `.profile-panel-body:has(.crew-grid)` `width: fit-content` (min 22rem), so the shared Connected Games panel is unchanged.
- At most 2 columns below 960 px; 1 full-width column below 640 px.
- Measured on a synthetic fixture page (real CSS and modules, no TESTING data), with every card keeping 16:9 and nothing overflowing or clipped:

| Viewport | Crews | Panel | Cards per row × rows | Card |
|---|---|---|---|---|
| 1440 px | 1 | 352 px | 1 × 1 | 304×171 |
| 1440 px | 2 | 658 px | 2 × 1 | 304×171 |
| 1440 px | 3 | 978 px | 3 × 1 | 304×171 |
| 1440 px | 4 | 978 px | 3 × 2 | 304×171 |
| 1440 px | 7 | 978 px | 3 × 3 | 304×171 |
| 900 px | 3–4 | 658 px | 2 × 2 | 304×171 |
| 660 px | 2–3 | 612 px | 2 per row | 281×158 |
| 375 px | any | full width | 1 per row | 343×193 |

**GR-01.**
- The top-level `#roleSuggestionsSection` card (`index.html`) and its Profile Editor entry are removed.
- `mountRoleReview` builds the same review (id kept, so the `account.role_suggestions` notification still opens it) as the last block of `#rolesSectionPanel`, after Suggest a Role and the section's Save, and only when `get_my_admin_status` is true.
- Enter in its fields no longer submits the profile form.
- Its controls have no `name`, so the Gaming Roles draft and dirty state are unaffected. Server authorization is unchanged (`ADMIN_ONLY`); administrators are still only @black's owner account. No suggestion was approved or rejected.

**Tests.**
- New: `tests/avatar-upload-validation.test.js` (4), plus 4 Avatar tests in `profile-banner-gateway.test.js`, which replace the byte-for-byte test, and a CP-01 test in `gaming-roles-favorites-crews.test.js`.
- Updated: GR-01 assertions, the pinned migration list, generic gateway accounting tests (→ `wall-media`), the cropper JPEG test and the upload-feedback fixtures.
- Targeted runs pass, then the mandatory CI. No screenshots.

STOP for owner acceptance.

## 39. ISS-0009 known synthetic URL closed; acceptance outcomes recorded — 2026-10-11

Documentation and test-data task (Mazen), TESTING only. No code, deployment or Truth change; product checkpoint unchanged (`a1d2eeb`).

**Synthetic object deleted (Mazen-authorized).**
- The object: `wall-video/4dea1112-567f-4f01-8f0f-a3187fd6f29c/184d21cc-1acd-4e72-ade4-69f4c83d59fe.webm` (105,320 bytes, `video/webm`, created 2026-10-05). It is the GM-TEST-01 Wall video behind the known 365-day pre-fix test URL (§30).
- Identified before deletion:
  - the folder is GM-TEST-01's owner uid, and the single COMPLETE usage receipt is GM-TEST-01's;
  - it was GM-TEST-01's only object;
  - no reference in a Wall draft, publication, Crew Wall card or derived object;
  - the Monitor's `open-assets` pilot only opens the Assets panel and names no asset.
- Deleted through the Storage API (CLI `storage rm`, exit 0). Verified gone: no GM-TEST-01 objects remain, and an anonymous direct read returns 400.
- The known URL itself was never retained (its scratch file was deleted in Phase 1D), so it could not be requested again. It is invalid because Storage honours a signed URL only while its object exists, as observed on TESTING in Phase 1B (400 after deletion).
  - A same-object lease check, run under a temporary synthetic publication, did not produce evidence: the lease request was malformed by PowerShell argument quoting and returned 404 before the deletion.
  - GM-TEST-01 was restored (DRAFT, 0 publications).
- GM-TEST-01 compared with the snapshot taken before: visibility DRAFT, no Avatar, Wall draft revision 1 (md5 `1b12bc34…`), 0 publications and 41 receipts are unchanged; objects went from 1 to 0. Its `wall_assets` row 20694c6e remains, pointing to the missing file (not removed: only the object was authorized).
- **Remaining ISS-0009 risk:** unknown long URLs a visitor may have minted before 2026-10-10 for then-public objects. They cannot be listed or revoked without rotating the JWT secret, which was not done. ISS-0009 stays FIXED until Mazen accepts this residual.

**Acceptance recorded.**
- ISS-0007: Mazen's manual test passed (a new Avatar saved and remained after refresh). Recorded as functional evidence; the issue stays FIXED, not VERIFIED.
- CP-01: REV-0002 (PASS, one Crew).
- GR-01: REV-0003 (PASS).
- Truth statuses are unchanged: `my-crews-view` and `gaming-roles-categories` remain PENDING_ACCEPTANCE as whole capabilities.

## 40. ISS-0009 owner acceptance — 2026-10-11

Documentation only (Mazen). No code, deployment, JWT rotation or Production access; product checkpoint unchanged (`a1d2eeb`).
- **Acceptance:** Mazen explicitly ACCEPTS the ISS-0009 security remediation on TESTING (Phase 1D, §30; closure assessment §38; known synthetic URL closed §39). This includes the documented residual possibility of unknown historical signed URLs.
- **Residual risk, disclosed and accepted, not resolved:**
  - URLs a visitor may have minted before 2026-10-10 for objects that were public then stay valid until they expire or their object is deleted. They cannot be listed or revoked without rotating the JWT secret, which was not done.
  - Issued leases run to their accepted lifetimes (Intro 120 s, Wall video 6 h).
  - The signing ban depends on Supabase setting `storage.operation()`; a periodic live check remains advisable.
  - Owners can sign their own files.
- **Product Memory:** ISS-0009 moves FIXED → VERIFIED, with `acceptance` recorded and the residuals kept in the record.
- **GamID Truth:** `visitor-media-access` moves PENDING_ACCEPTANCE → ACCEPTED (the capability is exactly this remediation); its checkpoint stays `660d911`. No contract or limit changed.

## 41. YOUR GAMID Editor desktop acceptance; Intro Preview Skip issue recorded — 2026-10-11

Documentation and Product Memory only (Mazen). No code, deployment, migration or Production access; product checkpoint unchanged (`a1d2eeb`).
- **Desktop acceptance:**
  - Mazen reported PASS for all 16 desktop manual tests of the YOUR GAMID Editor on TESTING and explicitly accepted the tested desktop functionality (Product Memory REV-0004). The tests cover independent saves, Save All Changes, drafts across collapse and navigation, Display Name validation, the ⋯ menu and Language, the Sign Out warning, feedback timing, the Avatar and Intro drafts, the visibility draft, Game Display persistence and feedback cleanup after re-sign-in.
  - Test 11 (pending Avatar draft) passed, but its visual preview was not conclusively verified.
  - The agent repeated none of the tests.
- **Android Chrome real-device acceptance is still outstanding** (`docs/PROFILE-EDITOR-UX.md`). Truth `your-gamid-editor` therefore stays PENDING_ACCEPTANCE; only its `record` now points to the desktop acceptance. ISS-0007 stays FIXED.
- **ISS-0010 (OPEN, kind BUG, needs investigation; authorization NONE):**
  - In the editor's Intro Preview, Skip leads to an older-looking Classic Profile card marked `DRAFT · PRIVATE` instead of the current Wall (when published and enabled) or Classic Profile. The same question applies to a natural end.
  - The record keeps the editor preview (the Profile Editor host) separate from the public visitor Intro on `/@<handle>`, which was not reported as wrong.
  - Unconfirmed code lead: the public page passes `publicMode` / `hostReveal` to the Intro frame, while the editor preview appears to pass neither. The frame then shows its own built-in card, whose `DRAFT · PRIVATE` chip is static markup.
  - No fix until Mazen authorizes one.

## 42. ISS-0011 Intro storage lifecycle fix, three authorized deletions, ISS-0012 limit confirmed — 2026-10-11

Owner-authorized (Mazen), TESTING only.
- Product checkpoint `4b56646e782eefadcc173b64e8aa59f0fab37cd9`.
- TESTING head `72896d6f5b08dc4b9ea96cd2c7b3e35f2277dbe4`. The extra commit is only an ISS-0007 record fix, explained below.
- Frontend: workflow run [38145293680](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38145293680), full validation passed, stamp `v=72896d6`.
- An earlier dispatch (run 38145182985) failed its commit check: another agent had pushed `06cec50` to this branch, so the branch head was not the expected SHA. My commit was rebased onto it.
- **ISS-0007 record:** that `06cec50` commit added a History line that is not a status transition, which fails Product Memory validation and so the CI gate. I removed only that line (`72896d6`); its evidence stays in the record body, word for word.

**Status.**

| Item | Status |
|---|---|
| ISS-0011 fix | IMPLEMENTED, TESTED, DEPLOYED; PENDING MANUAL ACCEPTANCE (ISS-0011 FIXED, not VERIFIED) |
| ISS-0012 | Confirmed by evidence; mitigated in the app only; OPEN for Mazen's decision |

**Deployment.**
- Migration `20261011240000_intro_storage_lifecycle`:
  - rehearsed in a rolled-back transaction (0 worker candidates, 0 owner candidates, client grants none) and applied, cutoff 2026-10-11 13:55:56 UTC; history repaired;
  - applying it changed no file, receipt or job.
- `usage-upload` v9: its downloaded deployed source is byte-identical to the repo, and an unauthenticated cleanup call returns 401.

**What changed.** The details are in ISS-0011 and `docs/global-usage-center.md`.
- Policy (`private.storage_lifecycle_policy`): failed-source retention 1 h, unbound-receipt grace 15 min, and automation only for items due since the cutoff.
- Failed jobs make their source eligible after the retention.
- The worker and owner cleanup skip anything due before the cutoff, the active Intro, and pending / processing sources.
- New service-only `usage_intro_cleanup_candidates`.
- `usage_upload_action` `release_unbound`.
- Gateway:
  - a refused upload start releases its own reservation and returns `UPLOAD_TOO_LARGE` (413) or `RESUMABLE_CREATE_FAILED`;
  - owner cleanup deletes the owner's due Intro files through `authorize_usage_delete` and records them.
- Editor: cleanup after Intro removal and before an Intro upload, plus two new messages.

**Authorized deletions.**
- The account was verified as the sole TESTING administrator, with live numbers matching Mazen's report.
- Each file was checked before deletion: owner, FAILED, not active, no other or live job, no ACTIVE receipt, exact size.
- Each was deleted through the gateway's DELETE route with worker credentials (`authorize_usage_delete` protections) and recorded with `worker_confirm_intro_cleanup`:

| Job | Size | Result |
|---|---:|---|
| `06824201-9c33-4643-a13c-2bb33a38ecd8` | 5,952,891 bytes | deleted, 13:47 UTC |
| `9c7ef884-9ab8-4e84-84a5-e0a7451ede10` | 5,952,891 bytes | deleted, 13:47 UTC |
| `80b489e3-259e-45ee-a46f-7aca2583d88d` | 17,483,880 bytes | deleted, 13:47 UTC |

- Usage: used 67.25 → 37.86 MB (Intro 30.12 → 0.73 MB); reserved 116.29 MB, unchanged.

**Not touched, as instructed.**
- The removed derivative (`0937bebb`, 734,172 bytes). It became eligible at 10:42, before the cutoff, so no automatic path selects it. It needs Mazen's decision.
- The 116.29 MB reservation (`e3c47109`, unbound, no file). It was created before the cutoff, so it keeps the 26-hour rule and releases after 2026-10-12 12:41 UTC, the next time Usage opens or an Intro save runs.

**ISS-0012.** Upload starts were requested from Storage with declared sizes only: no data was sent, any upload that started was terminated, and no object was left (verified).
- 116,291,584 and 52,428,801 bytes: 413.
- 52,428,800 and 50,000,000 bytes: 201.
- So the effective limit is exactly 50 MiB, Supabase's project-wide limit, while the editor, the bucket and Truth allow 150 MiB.
- The approved limit was not lowered and no infrastructure setting was changed.
- Needed (Mazen): raise the project-wide limit (a separate infrastructure authorization), or formally lower the Intro limit.

**Tests.**
- New `tests/intro-storage-lifecycle.test.js` (8).
- Updated `tests/usage-upload.test.js` (cleanup response shape) and the pinned migration list.
- Related files: 108 (1,451 pass, 1 existing opt-in skip); lint and typecheck pass.
- Mandatory CI passed.
- Not run live: an owner upload or removal, which needs Mazen's sign-in.

**Truth.**
- `intro-identity`: new `failedIntroSourceRetentionSeconds` 3600 and contract `intro-storage-lifecycle`; checkpoint `4b56646`.
- `global-usage`: new `unboundReservationGraceSeconds` 900; checkpoint `4b56646`.
- Both stay PENDING_ACCEPTANCE; the 150 MiB limit is unchanged.

**Minimum manual check (Mazen).** On `/account/`, upload an Intro **under 50 MB**, then use Remove Intro and Save. Expected:
- Usage's Intro value drops to that Intro's size, then to about 0.73 MB (the held old derivative) once it is removed;
- with the 116.29 MB reservation still held before 12:41 UTC tomorrow, an Intro over about 45 MB may still be refused for storage;
- optionally, an Intro over 50 MB is refused at once with "larger than the current upload limit", and Reserved does not grow.

REV-0004's 16 desktop passes and ISS-0010 are unaffected. STOP for owner acceptance.

## 43. Intro source upload limit 150 MiB -> 50 MiB — 2026-10-11

Mazen's approved product decision, TESTING only. The maximum single Intro upload is now 50 MiB (52,428,800 bytes), matching the effective Supabase project-wide upload limit confirmed in ISS-0012. Product checkpoint `5214d9b6add2629684e9c134f1e637598b90dd97`.

**Changed (one value at every Intro enforcement point).**
- Migration `20261011260000_intro_source_limit_50mib`: the `intro-sources` bucket `file_size_limit`, the `intro_processing_jobs_source_size_bytes_check` CHECK and the `queue_my_intro_impl` bound. Its RPC body is the live definition with only the constant changed.
- Editor: `INTRO_SOURCE_MAX_BYTES`, the two "Intro video must be 50 MB or smaller." messages, and the help text "max 50 MB".
- Truth: `intro-identity.introSourceMaxBytes` = 52428800, with its checkpoint updated.
- Docs: `docs/global-usage-center.md` and the worker READMEs.

**Unchanged.**
- The 200 MB account quota, and the Wall / Avatar / Banner and all other bucket limits (verified in the rehearsal).
- The Intro duration (0.5-30 s, inclusive 31 s tolerance), formats, processing, deletion and the ISS-0011 reservation lifecycle.
- The Intro worker's own `MAX_SOURCE_BYTES` stays a defensive 150 MiB processing ceiling. Changing it would need a worker image rebuild and redeploy; the stricter limits before it mean the worker never receives more than 50 MiB.
- Historical migrations and records are not rewritten.

**Verification.**
- Rehearsal on TESTING (rolled back):
  - only `intro-sources` changed (157286400 -> 52428800); the CHECK is validated with 0 violating rows (largest existing source 50,550,323 bytes);
  - the RPC carries 52428800 with no trace of 157286400, and its grants are unchanged.
- The live integration test (`tests/integration/intro-source-limit-db.sql`) was **not** run: it creates a disposable auth user inside its transaction. Its numbers are updated.
- Tests:
  - `tests/intro-source-limit.test.js` 9/9: exactly 52,428,800 bytes accepted, 52,428,801 refused, 116,291,584 and 150 MiB refused, durations unchanged, the RPC differs from the previous definition only in the constant;
  - 114 related files: 1,499 pass, 1 skip (after pinning the new migration in `tests/public-my-games.test.js`);
  - lint and typecheck pass.

**Deployment: BLOCKED (not applied, not deployed).**
- The CI gate runs the full suite, and `tests/product-memory.test.js` currently fails on three Product Memory records committed to this branch by other sessions:
  - DEC-0003: a History line that is not a status transition (`MANUAL PASS`);
  - ISS-0013 and REV-0005: `sources` lists `"Mazen screenshot"`, which is not a repository file.
- Product Memory may not be modified without Mazen's explicit approval, so they are untouched.
- To avoid an inconsistent TESTING state (an editor saying 150 MB over a 50 MiB backend), the migration is **not applied** and the frontend is **not deployed**. TESTING still serves `72896d6`, where Storage already refuses Intros over 50 MiB at the upload start with "larger than the current upload limit".
- **Next:** Mazen approves a minimal fix of those three records, or their author fixes them. Then apply migration `20261011260000`, deploy this commit through the workflow, and verify.

**Deployment (2026-10-11, after Mazen approved the three record fixes).**
- The records were fixed exactly as proposed, with content and evidence preserved:
  - DEC-0003: its manual PASS text moved verbatim from History into a "Manual test results" section;
  - ISS-0013 and REV-0005: "Mazen screenshot" moved from `sources` into the body ("kept outside the repository").
- Product Memory validation: 28 records pass.
- Migration `20261011260000` applied and history repaired. Live values: `intro-sources` = 52428800, the CHECK at 1..52428800, the queue RPC bound 52428800; all other buckets unchanged.
- Frontend: workflow run [38147127030](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38147127030), full validation passed, stamp `v=af2af0d`. The served `/account/` shows "MP4, MOV, or WebM · max 50 MB.", and `domain.js` / `supabase-client.js` carry the 50 MiB constant and "Intro video must be 50 MB or smaller.".
- PENDING Mazen's manual acceptance.

## 44. ISS-0010: the editor's Intro Preview returns to the editor — 2026-10-11

Approved by Mazen, TESTING only. Product checkpoint `737360748eff1b15dca938bb6f6fff2ae999660f`. Frontend workflow run [38148668016](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38148668016): full validation passed, stamp `v=7373607`.

**Root cause** (confirmed in the earlier read-only investigation).
- The editor's preview config (`currentPreviewConfig`) never asked the Intro frame for `hostReveal`.
- Skip (`terminatePlayback`) and the natural end (`begin` -> `finish`) both put the frame in its `profile` state, which shows the frame's own built-in profile card. That card is the original mobile card, with a static `DRAFT · PRIVATE` chip that is hidden only in `publicMode`.
- The public page passes `publicMode` / `hostReveal` and reveals the real Wall or Classic Profile instead, so visitors were never affected.

**Fix.**
- `dist/account/intro-preview-host.js` (new, `createEditorPreviewEnd`): once an editor preview has started (`intro` / `transitioning`), the frame's next `profile` state ends it. A `profile` report without a started preview is ignored, and each new preview resets the tracker.
- `dist/account/account.js`:
  - the preview config adds `hostReveal: true`, so the card is hidden even during the closing transition;
  - the frame's state messages (only from `introPreviewFrame`) feed the tracker;
  - the end and the Return to editor button share `closeIntroPreviewDialog()` (`stopIntroPreview()` + `dialog.close()`).
- **Unchanged:** `intro-preview.js`, `intro-preview.css`, `public.js`, transitions, Skip / Tap to play, leases and privacy.
- `package.json`: the new module is in `typecheck`.

**Verification.**
- `tests/intro-preview-editor-end.test.js` (6), using the real experience state machine:
  - Skip ends once; the natural end ends once, after the transition; stale states are ignored;
  - the wiring; the card hidden by `host-reveal`; the frame code unchanged; the visitor host unchanged.
- `tests/wall-public-publishing.test.js`: its V2b guard ("the owner's preview never asks for hostReveal") now asserts the approved ISS-0010 rule, exactly one request, in the preview config.
- 84 related test files pass (1 existing opt-in skip); lint and typecheck pass; CI passed.
- **Local real-browser harness** (the real frame and module, a synthetic 1.2-second WebM, no TESTING data):

| Run | States | Ended | Card / badge visible |
|---|---|---|---|
| Skip | `intro > profile` | once | never |
| Natural end | `intro > transitioning > profile` | once | never |
| Control: old config, no `hostReveal` | — | — | `DRAFT · PRIVATE` card visible after Skip (reproduces the bug) |

- In the natural run the video was muted before Tap to play, because the automation browser blocks unmuted autoplay.

**Truth.** `your-gamid-editor` has a new contract `intro-preview-returns-to-editor` and checkpoint `7373607`; it stays PENDING_ACCEPTANCE.

**Product Memory.** Not modified. ISS-0010 is still OPEN; its update to FIXED needs Mazen's save approval.

**Manual check (Mazen, desktop).**
1. `/account/` → Preview Intro → Skip Intro: back to the editor at once, with no `DRAFT · PRIVATE` card.
2. Preview Intro again and let it finish: after the transition, back to the editor.
3. Change something without saving, preview, then check that the draft is still there.
4. Optionally, as a visitor, `/@<handle>` still reveals the Wall or Classic Profile after the Intro.

STOP for owner acceptance.

## 45. ISS-0013: My Socials brand marks for TikTok, Twitch, Kick and Snapchat — 2026-10-11

Authorized by Mazen, TESTING only. Product checkpoint `ec3fda41f035d519109dd257e157e6b2f6497767`. **Not yet deployed** (see Deployment).

**Root cause.**
- My Socials badges are text glyphs from the catalogue in `dist/account/socials.js` (`TT`, `TW`, `K`, `SC`, `IG`, `DC`, `▶`, `X`, `f`) on brand-coloured circles.
- The Classic Profile visual review (§32; Truth `classic-profile-desktop` contract `desktop-social-marks`) gave only Discord and Instagram a desktop logo mark (a static CSS mask in `dist/public/public.css`).
- YouTube (`▶`) and X read as recognisable from their glyphs; TikTok, Twitch, Kick and Snapchat fell back to their letters. It was a missing mapping, not asset loading, a fallback bug or CSS breakage.

**Fix (CSS only).**
- The same mask mechanism now covers TikTok and Twitch (simple-icons paths, CC0) and Kick (its blocky K) and Snapchat (the ghost), both drawn here.
- Each mark uses the badge's existing text colour: white on TikTok / Twitch, black on Kick / Snapchat.
- Unchanged: sizes (44 px), placement, link destinations, accessible names, the YouTube / X / Facebook glyphs, and the mobile text marks (the accepted contract keeps them below 1280 px).

**Verification.**
- `tests/my-socials-brand-marks.test.js` (4) and the extended visual-review test: 405 related tests pass; lint and typecheck pass.
- Local real-browser harness (the real `public.css` and `socials.js`, synthetic markup):
  - at 1440 px, Discord, Instagram, TikTok, Twitch (white), Kick and Snapchat (black) render as marks, while YouTube, X and Facebook keep their glyphs, all 44 px;
  - in mobile mode every badge keeps its text mark;
  - the four new shapes were checked visually and read as their brands.

**Deployment: BLOCKED.** The CI gate's `tests/product-memory.test.js` fails on records committed by other sessions:
- DEC-0005: `ACCEPTED -> ACCEPTED` and no `acceptance` field;
- REV-0001: an `ACCEPTANCE RECONCILED` History line;
- INDEX: the REV-0001 title does not match the record.

These may only be fixed with Mazen's approval. Once fixed, deploy `ec3fda4`, then update Truth `desktop-social-marks` to name the four new marks (`classic-profile-desktop` stays ACCEPTED, with this extension pending Mazen's acceptance). Truth is unchanged until then because TESTING does not yet serve the fix.

**Product Memory.** Not modified. ISS-0013 stays OPEN. After Mazen accepts: OPEN → AUTHORIZED → FIXED → VERIFIED, with this root cause and checkpoint.

**Deployment (2026-10-11, after the Product Memory corrections in `514e462`).**
- Workflow run [38152454496](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38152454496): full validation passed; stamp `v=514e462`, a tree containing `ec3fda4`. The served `public/public.css` is byte-identical to the repo.
- Live `/@black`, visitor view:
  - **1440 px:** TikTok, Twitch (white) and Kick, Snapchat (black) render as logo marks; Discord and Instagram keep theirs; YouTube `▶` and X are unchanged; all 44 px. Every link keeps its host, `target=_blank`, `rel=noopener noreferrer nofollow` and accessible label.
  - **375 px:** every badge keeps its text mark (44 px), with no horizontal overflow.
- Truth: `classic-profile-desktop` (still ACCEPTED) contract `desktop-social-marks` now names the four new marks, with the extension pending Mazen's manual acceptance; checkpoint `ec3fda4`. `my-socials` is unchanged (ACCEPTED).
- Product Memory: not modified. ISS-0013 stays OPEN until Mazen accepts.

## 46. Public profile scroll bug (desktop Classic Profile) — 2026-10-11

TESTING only. Product checkpoint `5529d17df626b524c08514f321ee1499af87ff3c`. Workflow run [38153071764](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38153071764): full validation passed; TESTING serves `5529d17`.

**Bug.** At 1280 px and wider, `/@<handle>` could not be scrolled by the user (wheel, trackpad, keyboard, touch). Scripted scrolling still worked.

**Root cause.**
- While the Intro plays, `html.is-public-live:not(.is-public-flow){overflow:hidden}` locks the page.
- `createFlowLayout` (`dist/flow-layout.js`) lifts the lock only in "flow", which needs a height reported by the Intro frame (`wantsFlow && height > 0`).
- On desktop the page draws the Classic Profile itself: the frame is asked for `hostReveal`, and `showDesktop` hides it at `profile`. A hidden frame reports no height, so flow never started and the lock stayed (live: `overflow-y: hidden` with a 1,476 px page in a 900 px viewport).
- The published-Wall path never had this problem, because it already has its own rule (`html.is-public-live.is-public-wall{overflow-y:auto}`). Mobile and tablet use the frame's reported height, so they were never affected.

**Fix** (one CSS rule in `dist/public/public.css`): `html.is-public-live.is-public-desktop:not(.is-public-desktop-reveal){overflow-x:hidden;overflow-y:auto;scrollbar-gutter:stable}`.
- It mirrors the Wall rule and is more specific than the lock.
- It applies only once the desktop profile shows: the Intro and its reveal transition keep the lock, and Replay Intro relocks (`hideDesktop()` removes `is-public-desktop`).
- No nested scrolling: only the root scrolls. No JavaScript, layout or design change.

**Verification.**
- `tests/public-profile-desktop-scroll.test.js` (3); 38 related test files 627/627; lint and typecheck pass; CI passed.
- **Live `/@black` at 1440 px, before the fix:** a 10-notch wheel scroll stayed at 0.
- **After the fix:** wheel 571/571 and End 571/571 (the bottom); no horizontal overflow.
- **Lifecycle,** on the real page code with the frame's own state messages: intro locked, transitioning locked, profile scrolls, Replay Intro (intro) locked, profile scrolls again.
- **375 px:** unchanged; flow mode, page scrolls, no nested scrollers, no horizontal overflow.
- @black currently has no Intro (Replay hidden), so a real Intro playback was not run.

**Truth:** no change (a bug fix restoring the accepted behaviour; no contract, limit or status changes). **Product Memory:** not modified.

**Manual check (Mazen).**
1. Open `/@black` on desktop.
2. Scroll to the bottom with the mouse wheel or trackpad, and with the keyboard (End / Page Down).
3. With an Intro: after it ends and after Replay Intro, scrolling still works.
4. On a phone, touch scrolling still works.

## 47. My Socials: Spotify, SoundCloud and Vimeo — 2026-10-12

TESTING only. Product checkpoint `9e6e765a6ccabe7fdd9a6687990678d1125365eb`. Workflow run [38165131715](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38165131715): full validation passed; TESTING serves `9e6e765`. Migration `20261012100000_my_socials_spotify_soundcloud_vimeo.sql` APPLIED (rehearsed in a rolled-back transaction first, then `migration repair`).

**Scope (Mazen's task).** Add Spotify, SoundCloud and Vimeo to My Socials on the existing architecture: the user's own account only, never a track or video. Steam stays in Connections; no Other; Wall and Discord Profile Card unchanged; no mobile / tablet change.

**Change.**
- `dist/account/socials.js`: three ACCOUNTS entries on the Wall adapters' own account kinds: Spotify `artist`, SoundCloud `profile`, Vimeo `profile`. Detection, id rules and rebuilt addresses come from the Wall adapters. `SOCIAL_MAX` follows the list (12).
- Migration: three `social_platform_catalog` rows (sort 110 / 120 / 130) plus the same Wall-engine kind guard as `20261009151000`. The server rules (`private.wall_embed_specs`) already held these kinds. The RPCs, policies and existing links are unchanged, and the per-account maximum follows the active catalog.
- `dist/public/public.css` (desktop only, `html.is-public-desktop`): Spotify green with black arcs, SoundCloud orange with a white cloud and bars, and Vimeo blue with a white "v" (the simple-icons path, CC0). They sit in the existing marks block. The shared and mobile badge rules are untouched, so on mobile the three show the plain badge with their text mark.
- `dist/account/account.css`: editor badge colours.

**Verification.**
- **Tests:** full suite 1867 run, 0 failures; lint and typecheck pass.
  - New tests cover catalog parity with the new migration, account URLs accepted and content URLs (track, playlist, album, episode, show, video) refused, server refusals, and the desktop-only scoping.
  - Two migration-pin tests (`intro-source-limit`, `public-my-games`) now accept this later, unrelated migration and still check that it does not touch their contracts.
- **TESTING database:** 12 active catalog rows; the 9 saved links are unchanged.
  - On the synthetic `gm_test_01` fixture, in a rolled-back transaction, `set_my_social_links` saved Spotify artist, SoundCloud profile and Vimeo profile.
  - It refused a Spotify track and a Vimeo video (`NOT_A_SOCIAL_ACCOUNT`), and Steam (`INVALID_SOCIAL_PLATFORM`).
- **Live `/@black`,** visitor only, with temporary badges in the test browser (no data changed):
  - at 1440 px the three badges show their brand colour and mark;
  - at 375 px the existing icons are unchanged, the new ones are plain, and there is no horizontal overflow.
- No account on TESTING has these links yet.

**Truth:** `my-socials` now lists 12 platforms (limit 12, checkpoint `9e6e765`, contract `socials-own-named-platforms`), and `desktop-social-marks` covers the three new marks. Both note that the addition awaits Mazen's acceptance. **Product Memory:** not modified.

**Manual check (Mazen).**
1. Profile Editor → My Socials: add a Spotify artist, SoundCloud profile and Vimeo profile URL; Save; reload. They stay.
2. Try a Spotify track or playlist, a SoundCloud track and a Vimeo video. Each is refused.
3. Desktop `/@<handle>`: the three icons show the Spotify, SoundCloud and Vimeo marks and open the right pages in a new tab.
4. Phone: the existing icons look as before.

## 48. Final acceptances (My Socials expansion, Intro 50 MiB) + Spotify / SoundCloud / Vimeo logos on mobile — 2026-10-12

Mazen's explicit task "GAMID — Final Acceptance + Mobile My Socials Icons", TESTING only.

**A. My Socials expansion: ACCEPTED (Mazen 2026-10-12).** Spotify artist, SoundCloud profile and Vimeo profile, as deployed at `9e6e765` (§47; run 38165131715; migration `20261012100000`; 12 platforms).
- Recorded in Product Memory REV-0006 (new; none covered this scope: REV-0005 is the 2026-10-11 visitor-links acceptance).
- Truth `my-socials`: contract `socials-own-named-platforms` now says accepted. Status ACCEPTED, as before.
- Truth `desktop-social-marks`: the three desktop marks are accepted.
- Not reimplemented, migrated or redeployed.

**B. Intro source limit 50 MiB: ACCEPTED as final (Mazen 2026-10-12).** 52,428,800 bytes, as implemented at `5214d9b` (migration `20261011260000`) and deployed as `af2af0d` (§43).
- ISS-0012: OPEN → AUTHORIZED → FIXED → VERIFIED. The 150 MiB versus 50 MiB mismatch is resolved by Mazen's decision to standardize on 50 MiB.
- Truth `intro-identity`: new contract `intro-source-limit` records the limit and its acceptance. `introSourceMaxBytes` stays 52428800, and the status stays ACCEPTED.
- This covers the limit decision only; no other Intro issue changed.
- The limit, the migration and the Intro deployment are unchanged.

**C. Spotify / SoundCloud / Vimeo logos on mobile.** Product checkpoint `bc70717c3be5f10179e73649c6bd45fb7aa3e1d0`. Workflow run [38166266548](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38166266548): full validation passed; TESTING serves `bc70717`.
- `dist/public/public.css`: the three platforms' brand colours and marks move out of the desktop-only marks block into one all-width block after the shared badge colours. The values and the static mask mechanism are the same, so the desktop rendering is identical. Spotify shows black arcs on #1db954, SoundCloud a white cloud and bars on #ff5500, and Vimeo a white "v" on #1ab7ea.
- Unchanged: the other nine platforms (their accepted mobile text marks and desktop marks), the editor, the Wall and the Discord Profile Card.
- Tests: `tests/my-socials-brand-marks.test.js` checks that the three are drawn at every width and that no other rule names them. Full suite 1867 run, 0 failures, 1 skipped; lint and typecheck pass.
- Live check of `/@black`, visitor only. The account now holds real Spotify, SoundCloud and Vimeo links, added by its owner.
  - **375 px:** the three badges show their logo in brand colour, 44 × 44 px, nothing clipped, no horizontal overflow. Their links open `open.spotify.com/artist/…`, `soundcloud.com/…` and `vimeo.com/…` in a new tab with `noopener noreferrer nofollow`.
  - **768 px:** same; 12 icons, none clipped.
  - **1440 px:** all 12 badges are as before; the three new ones match their desktop look from before.
- Not performed: an editor save and reload, and a real-device test.

**Manual check (Mazen).** On a phone, open `/@black`. The Spotify, SoundCloud and Vimeo icons show their logos and open the right pages. The other icons look as before.

## 49. Wall Icon display option and Icon Group (DEC-0006) — 2026-10-12

Mazen's explicit implementation authorization of Product Memory DEC-0006, TESTING only. Product checkpoint `efac19e6a99d1aac9893243603d1db824534aefa`. Workflow run [38204748089](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38204748089): full validation passed; TESTING serves `efac19e`. Migration `20261012120000_wall_icons.sql` APPLIED (rehearsed in a rolled-back transaction first, then `migration repair`). PENDING Mazen's manual acceptance.

**Icon (every platform, every URL kind).**
- `presentation: "icon"` is a new embed presentation, offered for every kind of all 13 provider adapters. It is always listed last; Player / Card / Link are unchanged (`presentationsFor`, `validateEmbedData`). The Discord personal profile stays Link-only otherwise.
- On the Wall it is one round badge in a square box. It opens the adapter-rebuilt address in a new tab (`noopener noreferrer nofollow`). In the editor it is not a link.
- **Editor:** "Icon" appears in the paste flow and in **Show as**. Switching to Icon makes the box a 160-unit square; switching back restores the new presentation's starting size, in one undo step. Resizing keeps it square.
- **Other:** the Other form offers **Text link** (as before) or **Icon**. An Other Icon is a one-icon Icon Group.

**Icon Group (new `icons` element).**
- **Contents:** 1–24 icons in the owner's order. Each is `{ providerKey, kind, id }` (the Wall link engine, any kind) or `{ url }` (the Other link rule), with optional `size` 40–400, `gap` 0–200 and `align` left / center / right.
- **Layout:** `iconGroupLayout` aligns and wraps the icons inside the box and shrinks them together so none is cut off. A uniform group resize scales size and spacing.
- **Editor:** Media & Links → **Icon Group** creates a group from pasted links. A platform link keeps its platform icon; any other website becomes a link icon; unsafe links and unsupported pages of a supported site are refused with the existing wording. Properties lists the icons: change a link, move up / down, remove (one icon always stays), add, plus Icon size, Spacing and Align.

**Branding.**
- Each provider adapter declares its own badge (`icon`, so platform names stay in the adapters as the Wall guard requires). The badges are the Classic My Socials colours and marks / glyphs, and the Classic My Games Steam mark.
- The marks are byte-identical copies of the `dist/public/public.css` data URIs, enforced by `tests/wall-icons.test.js`.
- `platform-icons.js` holds the generic link icon for Other.
- `icons-paint.js` paints inline from these constants and re-checks every address before linking: provider hosts for a platform icon, the Other rule for Other.
- The Classic Profile code and CSS are untouched.

**Database (functions only).**
- `wall_embed_data_errors` now accepts `'icon'`.
- The new `wall_icons_payload_errors` is revoked from public, anon and authenticated.
- `wall_element_payload_errors` learns `icons`; the rest of its body is unchanged (pinned by a test).
- **Rehearsal** (rolled back, no user created): the 606-entry shared corpus, including 35 new Icon cases, gives the same errors in the database as in the browser. Without the migration the 35 new cases mismatch, so the check is meaningful.
- **Saved Walls:** all 5 drafts and 2 publications stay valid. After applying, the live database matches 606/606.

**Verification.**
- **Tests:** full suite 1883 run, 0 failures, 1 skipped; lint and typecheck pass. `tests/wall-icons.test.js` (16) covers every platform and kind, Classic branding parity, single Icon, Icon Group, editing and order, layout at several widths, URL safety, save / load / publish and the Discord safeguard. Presentation expectations in older tests gain `"icon"`; the corpus is extended and `tests/integration/wall-w2-db.sql` regenerated.
- **Local editor lab:** the real editor from this commit, served on localhost with only the Supabase client replaced by an in-memory fake, so no TESTING data was touched.
  - **Built:** an Icon Group from 6 pasted links; reordered, added an X icon, edited a link; a `javascript:` link was refused with the group unchanged.
  - **Single icons:** a Twitch Icon from the paste flow, and an Other Icon.
  - **Persistence:** Save, then reload: everything came back.
  - **Preview:** all 9 icons are real links (correct addresses, `_blank`, `noopener noreferrer nofollow`) and receive taps.
  - **Visitor painting** (`paintDocument` in view mode, as `public-wall.js`) at 1440 / 768 / 375 px: no horizontal overflow, badges inside their boxes, all round, all tappable; 38 px badges on a phone.
  - **Editor at 375 px:** the Icon Group panel fits, with 44 px buttons.
- **TESTING:** the served editor files contain the new code. `/@black` and `/@zshot`, viewed as a visitor, show their Classic Profiles with no errors; no visible published Wall exists there, so the live published-Wall path was not exercised.
- **Not performed:** a signed-in editor session on TESTING (protected accounts, no test account) and a real-device test.

**Discord safeguard.** The cancelled Wall Discord Profile Card task was not resumed. The Classic Discord Profile Card, Discord Connections and the Wall's Discord Link / Card are unchanged; Discord only gains the ordinary Icon.

**Truth:** new capability `wall-icons` (PENDING_ACCEPTANCE; limits, four contracts, checkpoint `efac19e`). **Product Memory:** not modified; the DEC-0006 status update is proposed, awaiting save approval.

**Manual check (Mazen).**
1. Wall Editor → Media & Links: paste a link (e.g. a YouTube video) and add it as **Icon**. Then switch its **Show as** between Card / Link / Player / Icon.
2. Media & Links → **Icon Group**: paste several links (platforms and a website). Add it, then move and resize the group as one element and check the icons rewrap.
3. Select the group: change a link, reorder, remove and add icons; try Icon size / Spacing / Align.
4. Media & Links → Other → **Icon**.
5. Save, reload, Preview: each icon opens its own link in a new tab. Publish and open your public Wall on a phone and on desktop.

## 50. Wall Icon and Icon Group: final acceptance — 2026-10-12

Documentation only (no code, migration or deployment). Mazen gave final manual acceptance of the Wall Icon display option and Icon Group (§49) on TESTING on 2026-10-12, confirming that all functionality works.
- **Accepted scope:** all 14 Media & Links platforms, Single Icon, Icon Group, working links, correct icons, saving, and the manually verified vertical layout. That layout is produced by the existing responsive wrapping (a narrow group box). No dedicated vertical layout control was implemented.
- **Unchanged:** implementation checkpoint `efac19e6a99d1aac9893243603d1db824534aefa`, TESTING run [38204748089](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38204748089), migration `20261012120000_wall_icons.sql`.
- **Truth:** `wall-icons` PENDING_ACCEPTANCE → ACCEPTED (record and notes updated; limits, contracts and checkpoint unchanged).
- **Product Memory:** DEC-0006 APPROVED → AUTHORIZED → IMPLEMENTED → ACCEPTED (authorization, acceptance, checkpoint, Implementation and Acceptance sections); Register updated.
- The cancelled Wall Discord Profile Card task stays cancelled.

## 51. Manual TESTING results: Enable / Disable My Wall, Discord, Intro Preview Skip — 2026-10-13

Documentation only (no code, migration or deployment). Mazen explicitly approved saving these manual results from TESTING.
- **Enable / Disable My Wall: PASS and ACCEPTED.**
  - Truth `wall-visibility-toggle`: PENDING_ACCEPTANCE → ACCEPTED. Its three contracts are unchanged; the record cites §25 and this section.
  - DEC-0003: IMPLEMENTED → ACCEPTED, with an acceptance entry, the manual result and a History line. Implementation checkpoint `85146e6` (run 37894870969, §25).
- **Discord: PASS.** Mazen confirmed that the existing Discord functionality works. This includes the Discord personal profile in the Wall and the Classic Profile (DEC-0002, §24), which was listed for his check.
  - Recorded as a manual test result in DEC-0002. Its status stays IMPLEMENTED, and no other acceptance status changed.
  - The cancelled Wall Discord Profile Card copy was not reopened.
- **Intro Preview Skip: PASS.** Mazen retested the issue and confirmed it no longer occurs.
  - The issue is ISS-0010, already VERIFIED (the closed state of the issue vocabulary) since 2026-10-11, after the fix at `7373607` (§44). The retest is added to its Resolution; there is no new status transition and no new code change.
- **Product Memory:** DEC-0003, DEC-0002 and ISS-0010 are updated, and the Register now shows DEC-0003 as ACCEPTED.
- **PROJECT_STATE:** the stale ISS-0010 "OPEN / PENDING" lines are reconciled, and the pending-acceptance list now shows 10.

## 52. DEC-0002 (one social link engine, Discord personal profiles): final acceptance — 2026-10-13

Documentation only (no code, migration or deployment). Mazen explicitly approved final acceptance of DEC-0002 on 2026-10-13, after the Discord PASS recorded in §51.
- **Product Memory:** DEC-0002 IMPLEMENTED → ACCEPTED, with an acceptance entry, an Acceptance section and a History line. The §51 Discord PASS is kept. The Register is updated.
- **Accepted scope:** the single Wall link engine shared by the Wall and My Socials, and the Discord personal profile kind (`discord.com/users/<id>`) as a Wall Link and as a My Socials Discord account (implementation `6704293`, run 37892333328, §24). The Discord Profile Card (DEC-0004) and the cancelled Wall Discord Profile Card copy are not part of it.
- **Truth:** the `game-id-wall` note no longer calls the Discord personal profile extension "pending manual acceptance". It now records the 2026-10-13 acceptance, and that the kind also offers an Icon since `wall-icons`. No capability status changed: `game-id-wall` and `my-socials` were already ACCEPTED, and the other pending capabilities are unchanged (10).

## 53. Gaming Roles: final acceptance — 2026-10-13

Documentation only (no code, migration or deployment). Mazen explicitly gave final acceptance of the entire Gaming Roles capability on 2026-10-13.
- **Accepted scope:**
  - all eight categories;
  - role selection and the Primary Role;
  - the Classic Profile badges;
  - Suggest a Role and the administrator review.
  Implementation: §37 (`506bfa7`, migration `20261011200000_roles_favorites_crews.sql`) and §38 (GR-01 placement at `a1d2eeb`).
- **Truth:** `gaming-roles-categories` PENDING_ACCEPTANCE → ACCEPTED.
  - Unchanged: the 71-role catalog, the 8 categories, the five contracts, the limits and the checkpoint `a1d2eeb`.
  - The record now cites this section and REV-0003. The other pending capabilities are unchanged (9 remain).
- **Product Memory:** REV-0003 (the existing Gaming Roles acceptance review, GR-01) gains a "Final capability acceptance" section, an updated summary and an updated Follow-up.
  - Its status stays COMPLETED, the final status for reviews. No new record was created and no other status changed.
  - The permanent administrator assignment remains a separate owner decision.

## 54. Favorite Games: final acceptance — 2026-10-13

Documentation only (no code, migration or deployment). Mazen explicitly gave final acceptance of Favorite Games on 2026-10-13.
- **Scope:** as implemented at `506bfa7` (§36-§37; run 38125086921; migrations `20261011180000_favorite_games.sql` and `20261011200000_roles_favorites_crews.sql`):
  - My Games hearts;
  - the desktop Classic Profile favorites row;
  - the separate My Games / Connections Settings cards;
  - artwork in View All Games.
- **Truth:** `favorite-games` PENDING_ACCEPTANCE → ACCEPTED.
  - Unchanged: all four contracts, the maximum of 4 favorite games and the checkpoint `506bfa7`.
  - The record cites REV-0007 and this section. The other pending capabilities are unchanged (8 remain).
- **Product Memory:** new REV-0007 (ACCEPTANCE, PASS, reviewer Mazen), because no existing record covered Favorite Games. It was saved with Mazen's explicit approval in this task, and the Register and REV counter are updated.

## 55. Edit Crew Name — 2026-10-13

Mazen's explicit implementation authorization ("GAMID — Implement Edit Crew Name"), TESTING only.
- **Checkpoints:** product `7fa7117ceab32061d1dd628d2724ad1678926db8`, on top of `3d72a5f`.
- **Deployment:** workflow run [38392848965](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38392848965); TESTING serves `7fa7117`. URL: https://gamid-testing-static.gamid.workers.dev/account/ → My Crew.
- **Migration:** `20261013100000_crew_rename.sql` APPLIED (rehearsed in a rolled-back transaction first, then `migration repair`).
- **Status:** PENDING Mazen's manual acceptance.

**Changed product rule (flagged).** My Crew V1 made a Crew's name, game and owner immutable: renaming meant deleting and recreating the Crew (`20261003100000_my_crew.sql`). By Mazen's task, only the **name** becomes editable by the owner. The game, owner and id stay immutable (`private.crews_immutable` still raises `CREW_IMMUTABLE` for them).

**Server.**
- New `public.rename_crew(crew_id, name)` → `private.rename_crew_impl`, granted to authenticated only.
- **Owner check:** made under the Crew's row lock (`CREW_OWNER_ONLY`).
- **Name rule:** trimmed, then exactly the `create_crew` rule: 2–40 characters, no control characters, no `<` `>` (`INVALID_CREW_NAME`). There is no uniqueness rule (none existed).
- **What changes:** only `crews.name`. The existing data-free `crew_changed` signal goes to the members and invitees.
- **Displays:** every one reads the name live (`get_my_crews`, the Crew Wall views, `get_public_crews` / the personal Crews section), so the new name shows everywhere. Notification contexts keep the name captured at their event.

**UI** (`dist/account/my-crew.js`, `account.css`).
- **Edit:** a 44 px pencil beside the owner's Crew name opens an inline field with the current name, Save and Cancel. The field takes focus.
- **Saving:** "Saving…" with the field, Save and Cancel disabled, so a second submit sends nothing.
- **Failure:** a persistent inline error (`role="alert"`) for permission, validation, network or server errors. Typing hides it in place without a re-render, and focus returns to the field.
- **Success:** the new name shows immediately and is then re-read.
- **Other changes:** members see no pencil, and the Create form's label now reads "Crew name (you can rename it later)".

**Verification.**
- **Tests:** `tests/crew-rename.test.js` (13 tests):
  - the UI flows: owner rename, Cancel, invalid names, one request while saving, inline errors, persistence after reload, a live refresh during editing, members without a pencil, layout CSS;
  - the database, with the real My Crew migration, the Crew Wall tables and this migration in PGlite: owner rename; member / outsider / invitee / anon refused; invalid names; only the name changes (members, invitations, Crew Wall, cards); game and owner still immutable.
  - Also updated: `my-crew.test.js` (the Create label) and the `public-my-games` migration pin.
  - Full suite 1896 run, 0 failures, 1 skipped; lint and typecheck pass.
- **TESTING rehearsal** (rolled back; synthetic GM-TEST fixtures only, a throwaway Crew with a member and a Crew Wall):
  - the member was refused (`CREW_OWNER_ONLY`) and a whitespace name refused (`INVALID_CREW_NAME`);
  - the owner's rename was stored trimmed, and both the owner and the member see it;
  - members, Crew Wall and cards were identical; the 2 real Crews were unchanged.
  - Re-run against the live functions after applying: same result. 2 Crews remain on TESTING.
- **Browser check:** the real `my-crew.js` and `account.css` with a fake API on localhost, at 1440 / 768 / 375 px. The pencil is 44 × 44 px; the field, Save and Cancel fit the card; no horizontal overflow; save, error, Cancel and focus all behave as described.
  - The first deploy (`3d72a5f`) showed the pencil inheriting the full-width `.text-button` and squeezing the name to one letter per line. This is fixed in `7fa7117`.
- **Not performed:** a signed-in rename on TESTING (no test account; the real Crews belong to protected accounts) and a real-device test.

**Truth:** new capability `crew-rename` (PENDING_ACCEPTANCE; limits 2 / 40 characters; contracts `crew-rename-owner`, `crew-rename-validation`, `crew-rename-integrity`; checkpoint `7fa7117`). **Product Memory:** not modified.

**Manual check (Mazen).** Sign in, open My Crew and press ✎ beside `espada` (Marvel Rivals).
1. Change the name and Save: the name shows at once and stays after a reload.
2. Check that it appears on the Crew Wall and on your public profile's Crews.
3. Check that the members, invitations and the Crew Wall are unchanged.
4. Try an empty name and Cancel.
5. Check that a member account sees no pencil.
6. On a phone, check the field and buttons fit.

## 56. Edit Crew Name and My Crews: final acceptance — 2026-10-13

Documentation only (no code, migration or deployment). On 2026-10-13 Mazen explicitly confirmed successful manual testing and gave final acceptance of:
- **Edit Crew Name** (Truth `crew-rename`, §55; checkpoint `7fa7117`, run 38392848965, migration `20261013100000_crew_rename.sql`): PENDING_ACCEPTANCE → ACCEPTED.
- **My Crews** (Truth `my-crews-view`, §33, §37, §38; checkpoint `a1d2eeb`), including the existing member invitation flow: PENDING_ACCEPTANCE → ACCEPTED.

**Rule change recorded.** Crew names are owner-editable; this replaces the My Crew V1 immutable-name rule (`20261003100000_my_crew.sql`). The Crew's game and owner stay immutable. This is noted in Truth `crew-rename` and `my-crew`, whose status, limits and checkpoint are unchanged.

**Preserved:**
- all contracts and limits of both capabilities, including:
  - the 10 ACTIVE Crew memberships per GamID (`crew-membership-limit`);
  - the member visibility rules;
  - owner-only actions;
  - the 2–40 character name rule;
- the implementation checkpoints.

Remaining PENDING_ACCEPTANCE capabilities: 7.

**Product Memory:** not modified. The records proposed to Mazen await his separate approval.

## 57. Account saved Classic owner preview — 2026-10-14

Authorized by Mazen's Live Preview replacement task and continuation; TESTING only, PENDING owner acceptance. Started at GitHub `2d8a657e400c85676ed9996ac867a27fc8125a1a` on the current unmerged development branch `feature/play-together-notifications`. Product checkpoint: `41aa90692c164d9675698131f561b285cdc8b736`.

Preview Your GamID Classic replaces the oversized Live Preview draft card. The existing Classic host renders currently saved owner data in a full-screen dialog over Account. Back to Edit keeps Account at `/account/` and preserves all unsaved drafts, including Avatar and Intro selections. The preview works for an unpublished identity and with any Wall state; no Intro, Wall lookup, save, publication or media upload is performed. Existing Classic sections, saved opt-ins, server ownership and other-person public gates are retained. The old card's GamID Publish / Unpublish row, Share your GamID and My Wall remain independent. No Classic redesign or change to the independent Intro Preview.

Full build: 1902 tests, 1901 PASS / 1 existing SKIP / 0 failures, plus lint and syntax checks. Owner browser round trips at 1440 and 390 passed; Avatar and valid local Intro drafts retained; no writes or Intro; signed-out access refused. Public Classic snapshots are pixel-identical to starting `2d8a657` at both widths, and ordinary visitor Wall selection is preserved. Existing Profile Editor browser regression passes at 1280 and 390. Fixture backend is mocked; no real user data is changed and no owner/Android acceptance is claimed. Detailed scope, security, test procedures and deployment confirmation: [`docs/CLASSIC-PROFILE-OWNER-PREVIEW.md`](docs/CLASSIC-PROFILE-OWNER-PREVIEW.md).

GamID Truth UPDATED (`your-gamid-editor` contract/checkpoint; removed Live Preview wording in Gaming Roles). Product Memory PROPOSED, not saved; separate approval required. No Production, migration, backend/worker deployment or branch merge. Stop after TESTING verification for Mazen's acceptance.

**§57 deployment confirmation (2026-10-14):** [Cloudflare TESTING run #108](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38427825018) SUCCESS from exact `7aa0133ee881e171f3b03fb868bb0145695a66f7`. Complete CI validation and smoke checks passed; the eight changed frontend files match the source after stamping. Deployed-frontend owner browser fixtures passed at 1440 and 390 with every round trip, draft preservation, no writes/Intro, unauthorized refusal and visitor Wall behavior intact. Backend requests were mocked, not real-user writes. Final delivery-record commit is documentation only; deployed frontend stays `7aa0133`. No acceptance is inferred. STOP for Mazen review.


## 58. Desktop Profile Editor redesign (2026-10-14)

Mazen explicitly authorized implementation after the reference review and resolved decisions. Product `436de5e3cf9990c88c7863996542900018514013`, `feature/play-together-notifications`, from verified clean GitHub `99874cf`. Desktop begins at 1024px; sidebar / real summaries, five nested About Me sections with one Identity, independent original saves / drafts, static Play Together and My Wall preserved. Mobile/smaller widths unchanged. No backend, infrastructure, Production, merge or Product Memory changes. Full implementation, deliberate reference differences, reproduction and validation: [docs/PROFILE-EDITOR-DESKTOP-REDESIGN.md](docs/PROFILE-EDITOR-DESKTOP-REDESIGN.md). **PENDING Mazen review and acceptance.**

Final TESTING deployment `57e7adb8ae2c125366c1fb4b675c20efc04a1ad9`, [run 38512058032](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38512058032) SUCCESS. Full build: 1901 PASS / one existing SKIP / zero failures. Local functional editor checks 1024 / 1280 / 390 pass. Deployed layout 1024 / 1280 / 1440 / 1920 / 390 and boundary 1023 pass; deployed smaller-width screenshots match `99874cf` exactly at 390 / 1023. Deployed Classic owner preview 1440 / 390 passes with drafts, saved data, Wall bypass, Intro bypass and unauthorized refusal; six key frontend files match the committed sources. All browser backend traffic mocked; no real account writes. Documentation-only delivery commit follows; **STOP for Mazen review**.

## 59. Desktop Profile Editor media review (2026-10-14)

Mazen authorized four visual-review fixes from verified GitHub/local `c4116ef`. Product `0dd59a91b947571d5579c8ed61be5c94cb9dffc0` on `feature/play-together-notifications`: existing/local Intro real paused frame thumbnails, stored Steam avatars and existing League profile-icon IDs, independent Desktop card/column flow, and shared canonical artwork in Editor / saved owner Classic Preview. Existing saves, drafts, privacy, verification, Wall, Intro Preview and smaller-width presentation are preserved. The existing game-artwork function adds a caller-authorized owner read; no infrastructure/schema/new processing service, Production, main merge or protected-identity changes. Full causes, architecture, tests, limits and governance: [docs/PROFILE-EDITOR-MEDIA-REVIEW.md](docs/PROFILE-EDITOR-MEDIA-REVIEW.md). **PENDING Mazen review and acceptance.**

GamID Truth UPDATED for the owner media/artwork contracts and checkpoints; Product Memory PROPOSED only, no files saved. TESTING deployment confirmation follows after successful validation. STOP after delivery for Mazen review.

TESTING: existing game-artwork v6 ACTIVE, exact three-file source verified; live anonymous/invalid owner requests 401 with private/no-store. Frontend `1b247fc114719e840f9e914a85f9701098433c88`, [run 38551040449](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38551040449) SUCCESS. Full build 1909 PASS / one existing SKIP / zero failures. Functional editor 1024 / 1280 / 390 PASS; deployed media 4/4, Classic Preview 2/2, layout 6/6 PASS; deployed mobile 390 / 1023 pixel-identical to `c4116ef`; eight frontend files match source. Browser backend traffic intercepted; no real account writes or acceptance claimed. Documentation-only final confirmation follows; **STOP for Mazen review**.

## 60. Adaptive Desktop Profile Editor architecture (2026-10-15)

Mazen explicitly authorized a whole-page architecture review and implementation, including compact real Intro thumbnail and My Duo / My Crew adjacency in the right column. Product `e18c695ef5194d0448472da0b434a9fd1097dcdb` on `feature/play-together-notifications`, from verified clean local/GitHub `155e845`. One stable natural column plan now governs every main card, with card-width responsive forms and bounded/wrapping summaries. Original live fields, per-section saves, Save All, drafts, workflow boundaries, privacy and mobile restoration remain. No backend, infrastructure, Production, main merge or Product Memory changes. Full architecture, tests, screenshots and limits: [docs/PROFILE-EDITOR-ADAPTIVE-LAYOUT.md](docs/PROFILE-EDITOR-ADAPTIVE-LAYOUT.md). **PENDING Mazen visual review; not ACCEPTED.**

GamID Truth UPDATED for the Desktop layout contract and current editor checkpoint; acceptance statuses and limits unchanged. Product Memory PROPOSED only. Deploy through the established exact-SHA TESTING workflow after validation; record confirmation here, then STOP for Mazen review.

TESTING deployment `43be3cbdd7dcbabdc04cc1a93f5b92bbd6f27ab7`, [run 38668586693](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38668586693) SUCCESS. Nine served frontend files exactly verified. Full build 1909 PASS / one existing opt-in SKIP / zero failures. Functional editor 1024 / 1280 / 390 PASS. Deployed adaptive matrix 18/18, layout 6/6, media 4/4, Classic Preview 2/2 PASS. Deployed mobile 390 / 1023 pixel-identical to `155e845`; public Classic local pixel equality also passes. All browser backend traffic intercepted fixtures; no protected-account mutations or backend changes. Documentation-only delivery confirmation follows; **STOP for Mazen visual review, not ACCEPTED**.

## 61. Paired Desktop summaries and one full-width editor (2026-10-15)

Mazen explicitly approved implementing GamID-Layout-Proposal-v1 with the final single-open-editor behavior, superseding the earlier multi-open proposal and adaptive stacks. Product `61de6220a37922a776cddd19771b10bdac4fde51`, authorized branch `feature/play-together-notifications`, from verified clean GitHub/local `5437dcf`. Six equal-column summary pairs preserve alignment; selected original details span the workspace below their row. My Duo is right above My Crew, opposite static Play Together and My Wall respectively. Switching editors closes disclosure only, retaining every original draft; no automatic save. About Me keeps its five actual nested editors, one selected at a time, with independent saves. Save All and notification/error/OAuth destinations share the single-open reveal path. Below 1024px the original mobile DOM, disclosure behavior and presentation remain.

Implementation, validation and limitations: [docs/PROFILE-EDITOR-PAIRED-ROWS.md](docs/PROFILE-EDITOR-PAIRED-ROWS.md). Full build: 1910 tests, 1909 pass, one opt-in skip, no failures. Browser: 18 layout scenarios across six Desktop widths; 1024/1440 independent saves, Save All, partial failure/retry, Banner crop/save and Avatar/Intro drafts; unchanged comprehensive 390px workflow; 1440/390 saved Classic and unauthorized refusal; media regression 1024/1440/1920/390. Mobile screenshots at 390 and 1023 are byte-identical to starting `5437dcf`. All browser backend writes are isolated fixture responses, not real accounts. No backend, infrastructure, Production, main merge or Product Memory changes.

GamID Truth UPDATED: Desktop paired-row and single-open disclosure contracts and editor checkpoint only; statuses and limits unchanged. Product Memory PROPOSED only: final Desktop disclosure decision, separate save approval required. Deploy only through the exact-SHA TESTING frontend workflow after checks. **PENDING Mazen visual review and final acceptance; not ACCEPTED.**

TESTING delivery §61: source `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`, workflow [38690648784](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38690648784) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Nine served frontend files verified exact, with expected asset stamp. Post-deploy isolated browser reruns PASS: six layout cases at 1024/1440; Desktop saves/media drafts/Banner at both widths and the full existing 390px workflow; saved Classic 1440/390; media 1024/1440/1920/390. No real account writes. Following documentation and fixture screenshot-wait changes leave deployed `dist/` identical. Stop for Mazen visual review; PENDING acceptance.

## 62. Final Desktop Profile Editor acceptance and Product Memory save (2026-10-15)

Mazen manually reviewed the deployed Profile Editor on TESTING and explicitly confirmed **Everything is approved**, then separately authorized saving the relevant Product Memory records. This is final acceptance of the implemented Desktop layout and editing behavior: balanced paired columns at 1024px+, one editor open, automatic disclosure closure with all unsaved drafts retained (including Avatar/Intro), original full-width details below the row and natural growth without stretched peers/long side gaps, Duo above Crew on the right and Wall opposite Crew, existing saving/Save All/privacy/limits and mobile layout preserved.

Verified before writing: local and GitHub authorized branch feature/play-together-notifications at 446ba095578299c46f32547ac0f8bd6339e9c0ad; product 61de6220a37922a776cddd19771b10bdac4fde51 is an ancestor and its dist tree matches deployed 1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2; workflow 38690648784 SUCCESS; nine currently served TESTING files exactly match the deployed source. Truth your-gamid-editor is now ACCEPTED, retaining the correct implementation checkpoint 61de6220a37922a776cddd19771b10bdac4fde51; contracts and limits unchanged. Earlier pending Desktop acceptance statements are historical and superseded by this section. No new Android real-device acceptance or unrelated Avatar security-issue verification is inferred.

Product Memory SAVED with Mazen's explicit 2026-10-15 approval: updated existing IDEA-0001 (reopening/authorization/implementation/acceptance history, chosen design, rationale and rejected multi-open alternative), REV-0004 (current final manual PASS plus the original 16-test review retained), and INDEX. No new IDs or duplicate records. Prior functional evidence is retained with attribution, not represented as fresh testing during this documentation-only task. No product files, deployment, infrastructure, Production or main merge changes.

Acceptance-recording validation: Product Memory validator PASS (32 existing records, unchanged ID counters); Truth and Product Memory test suite PASS (37/37, zero failures); whitespace/diff check PASS. No functional, visual, test-code or deployment-file changes. This task records Mazen's manual outcome and prior implementation evidence; it does not rerun functional browser acceptance.

## 63. Public GamID Profile final acceptance (2026-10-15)

Mazen explicitly approved the Public GamID Profile on TESTING as **PASS and ACCEPTED**, with no further manual testing required for this acceptance; future issues are tracked separately. Truth public-gamid-profile transitions from PENDING_ACCEPTANCE to ACCEPTED, with implementation references preserved (Slice 1 697b6e3773233d4b403becb63a6857893dbe0ea2, Slice 2 ce2018f3ff5b2de0a688d3970d81b0c71d8d5cb7, sharing b1caefacf4652e090d134e9e50851572e9a088eb; prior accepted responsive-height and Opera reliability references remain). The composite capability had no single checkpoint field; this acceptance task does not invent one or replace provenance with a documentation SHA. Earlier pending Public GamID Profile statements in historical §7b/§7d/§7f are superseded by this explicit final acceptance.

Reused existing Product Memory REV-0001 item 4, preserving the original review and other items' scopes; no duplicate review or new ID. INDEX, roadmap and continuation pointers updated with Mazen's explicit authorization. Verified clean local/GitHub feature/play-together-notifications at 70b28c0a84f4ec585f221531bf716f372b172fdc before edits. No functionality, visual, test-code, deployment, main merge or Production changes. No new manual or functional test execution claimed.

## 64. Targeted Desktop sidebar and Crew presentation (2026-10-15)

Mazen authorized widening the actual YOUR GAMID sidebar toward 2× on wide Desktop, centering and rebalancing the page at Zoom 100%, and reusing the public MY CREWS rich card renderer in owner summaries. Product `35842e9e44cab1adc82c57a50f506916405f8d76` on feature/play-together-notifications, from verified clean local/GitHub `56c5667`. Sidebar widths: 208px at 1024/1280, 336px at 1440, 488px at 1920; maximum shell 2000px. Existing equal columns, full-width panels, single-open behavior and all draft/save/privacy contracts remain. Crew tiles reuse actual renderer, canonical artwork and already-loaded public-avatar Blob URLs; no new service, business logic or permission.

Full architecture, validation and limitations: [docs/PROFILE-EDITOR-SIDEBAR-CREW-PRESENTATION.md](docs/PROFILE-EDITOR-SIDEBAR-CREW-PRESENTATION.md). Build 1909 PASS / one opt-in SKIP / zero failures; 12 Desktop layout cases at four widths; functional 1024/1440/390, media 1024/1440/1920/390, Classic 1440/390 PASS. Mobile 390/768 screenshots byte-identical; existing 768px overflow is 80px both before/after and is not changed by this Desktop-only task. No public files, backend, infrastructure, Production, main merge or Product Memory changes. GamID Truth NO CHANGE REQUIRED (cosmetic presentation; accepted material behavior checkpoint/status retained). Product Memory PROPOSED only, separate save approval required. **New presentation PENDING Mazen visual review; not ACCEPTED.** Deploy only TESTING after validation.

TESTING delivery: source `ff5fff9d6a1e7ba609822243a3e7efe4cc632174`, [workflow 38736570261](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38736570261) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Eleven served frontend files verified exact, including changed my-crew.js, Desktop JS/CSS and the reused public Crew renderer. Deployed isolated fixture reruns PASS: 12 layout cases at 1024/1280/1440/1920, functional 1024/1440/390, media 1024/1440/1920/390 and Classic 1440/390. All backend writes intercepted; no real account mutation. Governance validation 37/37 PASS; Product Memory 32 existing records PASS and unchanged. Final delivery documentation does not change deployed dist. **STOP for Mazen visual review; these presentation improvements remain PENDING acceptance.**

## 65. My Crew owner navigation and public nine-plus-one directory (2026-10-16)

Mazen explicitly authorized the My Crew UX Improvements task: two artwork summaries plus centered more action; owner compact list, one management region, Back and compact Add Crew using existing workflows; public first nine cards and explicit accessible tenth. Product `7ab1278f94c36c265df1d47b4388ab1db418c3dd`, feature/play-together-notifications, resumed with existing uncommitted work from verified GitHub/local `1485d43`, prior TESTING source ff5fff9. No restart of completed work: original full build and 35-case matrix evidence were inspected and retained.

Architecture and evidence: [docs/MY-CREW-UX.md](docs/MY-CREW-UX.md). Full build 1910 PASS / one opt-in SKIP / zero failures; focused Crew tests 45/45; 35 count/viewport browser cases; six final-stylesheet follow-ups; tenth actual navigation; editor/media/Classic regressions PASS. All backend writes mocked; no real account mutations. No backend, migrations, infrastructure, Production or main merge. The unchanged whole-Account 768px overflow belongs to the prior task and is not introduced by Crew CSS; tested Crew regions/directories have no overflow.

GamID Truth UPDATED with separate crew-ux-navigation PENDING_ACCEPTANCE and its current product checkpoint, preserving accepted base records/limits: 10 memberships, 15 active members, one ACTIVE Crew per game, existing stage policy. Product Memory PROPOSED only; no records/index saved. **New UX not ACCEPTED; stop after successful TESTING deployment for Mazen visual review.**

TESTING delivery (2026-10-16): source `1a980aa1b758e063c35537206fd20ec42c3c8922`, [workflow 38774238925](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38774238925) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Thirteen served frontend files match the deployed source with the expected asset stamp. Post-deploy isolated browser checks PASS: six Crew cases (5/10 Crews at 390/768/1440, including original management actions and actual tenth-Crew navigation), three editor functional cases (1024/1440/390), and two Classic cases (1440/390). All backend writes intercepted; no real account mutations. Final delivery documentation leaves deployed dist unchanged and requires no redeployment. Product Memory remains unsaved. **STOP for Mazen visual review; crew-ux-navigation remains PENDING_ACCEPTANCE.**

## 66. Final My Crew UX polish (2026-10-16)

Mazen authorized three collapsed artwork Crew cards (remaining centered count at four+), prominent Back to All Crews, independent two-column Desktop owner management and responsive 1–3-column member grids up to the existing capacity of 15. Product `fcbf081b0b7446427d0d2c1462ae24dea4b97c14`, authorized feature/play-together-notifications, from verified clean local/GitHub b5e5792. Full implementation, responsive thresholds and validation: [docs/MY-CREW-UX.md](docs/MY-CREW-UX.md). Original forms, actions, drafts, artwork/avatar sources, privacy and permissions retained; no backend/infrastructure or unrelated redesign. Public nine-plus-one unchanged.

Build 1910 PASS / one opt-in SKIP / zero failures; focused Crew tests 45/45; 35 browser count/width cases and five additional 15-member long-name cases PASS; existing editor functional 1024/1440/390 PASS. Browser services/writes mocked, no real account mutation. Truth crew-ux-navigation UPDATED with current checkpoint and selection/layout contracts, remains PENDING_ACCEPTANCE; accepted base records and limits unchanged. Product Memory PROPOSED only; no record/index saved. Deploy TESTING only after checks, then STOP for Mazen review; not ACCEPTED.

TESTING delivery (2026-10-16): source `83f130458fdd9977629c643392a53eb7b9b02989`, [workflow 38777463729](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38777463729) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Thirteen served frontend files verified exact with expected asset stamp. Post-deploy browser fixtures PASS: six Crew count/width cases (4/5 Crews at 390/1024/1440), two additional 15-member cases (390/1920), and three existing functional cases (1024/1440/390), including independent saves, Save All, errors/retry and Avatar/Intro drafts. New three-summary same-row/overflow assertions PASS on TESTING. All backend traffic/writes intercepted; no real account mutation. Delivery documentation does not alter deployed dist and requires no redeployment. **STOP for Mazen visual review; PENDING_ACCEPTANCE, not ACCEPTED.** Product Memory proposal prepared outside the repository records, not saved.

## 67. Approved My Crew image reference and selected member removal (2026-10-16)

Mazen explicitly authorized the attached Neon My Crew Editing Dashboard.png as visual specification, four Desktop member columns (15 = 4+4+4+3), aligned 3:2 members/Wall containers, Back above and Delete centered below, replacing individual Remove buttons with header Add a GamID / Remove a GamID and checkbox selection plus explicit removal confirmation. Product `0f386d379e811d14afcc043a11601d7f459bd402`, authorized feature/play-together-notifications from verified clean local/GitHub 7f171fa. Existing per-member removal RPCs run sequentially under original authorization; owner excluded, first failure stops with refreshed state and retry selections without repeating successes. No batch backend or new permission. Full layout, dialog lifecycle, responsive behavior and evidence: [docs/MY-CREW-UX.md](docs/MY-CREW-UX.md).

Full build 1913 PASS / one opt-in SKIP / zero failures; focused Crew tests 48/48; 30 count/width browser cases and five 15-member cases PASS, plus two final modal/breakpoint cases. Existing editor functional 1024/1440/390 PASS. Tests use intercepted fixtures, never protected/real account writes. Truth crew-ux-navigation UPDATED with reference and selected-removal contracts/checkpoint, remains PENDING_ACCEPTANCE. Accepted base records, limits, permissions, original invite/rename/Wall/publication/saves and unrelated sections preserved. Product Memory proposal only; no records or INDEX saved. Deploy TESTING only after validation, then STOP for Mazen visual review; not ACCEPTED.

TESTING delivery (2026-10-16): source `c81ad33a38b101e7f77f76ce8eb5ca6a03850c36`, [workflow 38855728905](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38855728905) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Fourteen served frontend files verified exact with the expected asset stamp, including crew-wall-panel.js and the scoped Crew stylesheet. Post-deploy isolated browser cases PASS: four 15-member cases (390/1024/1440/1920), including four-column geometry, native selection/confirmation/keyboard/focus, responsive modal dismissal and actual mocked removal of two non-owner members only after explicit confirmation; three original functional cases (1024/1440/390), including independent saves, Save All, errors/retry and Avatar/Intro drafts. All backend traffic/writes intercepted; no real account mutation. Final delivery documentation leaves deployed dist unchanged; no redeployment needed. Product Memory proposal prepared outside repository records; no record or INDEX saved. **STOP for Mazen visual review; PENDING_ACCEPTANCE, not ACCEPTED.**

## 68. Final My Crew acceptance and approved Product Memory save (2026-10-16)

Mazen explicitly approved the latest My Crew design and functionality deployed on TESTING `c81ad33a38b101e7f77f76ce8eb5ca6a03850c36` in GAMID — FINAL MY CREW ACCEPTANCE, and separately authorized saving the relevant approved Product Memory proposal. Truth crew-ux-navigation is now ACCEPTED, preserving implementation checkpoint `0f386d379e811d14afcc043a11601d7f459bd402`, existing contracts and limits. This covers the implemented Crew reference layout, four-column members, original navigation/drafts, Add/Invite and confirmed owner-only member-selection removal; prior pending statements above and in §65–§67 are historical and superseded for this capability. Other accepted base records remain unchanged.

Verified before writing: clean local/GitHub feature/play-together-notifications at 7edbf253164c45d1a33eb210aece7ab30970b32e; workflow 38855728905 SUCCESS for c81ad33; fourteen currently served TESTING files exact; implementation/deployed dist trees identical. Updated existing Product Memory IDEA-0001 and INDEX with rationale, prior testing evidence and final approval, preserving original Desktop acceptance/history; no duplicate or new IDs. This task records the explicit owner outcome and prior implementation evidence, without rerunning functional/manual tests. No product code, tests, deployment files, redeployment, Production access or main merge changes.

Acceptance-recording validation: Truth/Product Memory tests 37/37 PASS, zero failures; Product Memory validator PASS for 32 existing records, unchanged ID counters; whitespace/diff check PASS. Only six documentation/acceptance files changed. Product, test, workflow, backend and infrastructure files remain unchanged.

## 69. Steam My Games acceptance and League prototype-only acceptance (2026-10-16)

Mazen explicitly authorized these two separate acceptance decisions and Product Memory saving in STEAM & LEAGUE FINAL ACCEPTANCE. Steam My Games: his manual TESTING check on 2026-10-16 confirmed Steam CONNECTED, successful real library discovery returning two games including Marvel Rivals, both shown in My Games, and explicit approval. Truth steam-my-games is ACCEPTED, preserving implementation `aa4aa5e03ecaff15f50d86b03ebb8313a6641b95`. This functional outcome supersedes older missing-Steam-key blockers in §3/§7n and historical deployment/continuation notes; no secret value, secret inventory or credential was accessed or exposed. Discovery remains private by default, owner-triggered, and discovered rather than verified. No second game name is inferred.

League: ACCEPTED AS PROTOTYPE ONLY, preserving implementation `44c7a4455f40088572d165a6de453b73491d6500`: manual Riot ID, temporary unofficial OP.GG adapter, private unverified account data and current limitations. Truth league-prototype uses ACCEPTED with its prototype designation and scope retained. No successful real-account manual test, official Riot authentication/RSO/API integration or account verification is claimed. Existing separate visibility/privacy contracts remain unchanged; this acceptance creates no public access. Historical technical probes and generic checklist PASS do not establish a new real-account manual result.

Existing Product Memory REV-0001 items 5/6 and INDEX updated with distinct evidence/limitations; original review and prior Public Profile/Global Usage acceptance retained. No duplicate record or new ID. Verified clean local/GitHub feature/play-together-notifications at 7f7cc5ea10eee94c5a0f6517e59ef41843f73988 and both original implementation commits before edits. Documentation/acceptance only: no product/test code, deployment, migrations, Production or main merge; no new functional/manual test run or external provider calls.

Acceptance-recording validation: Truth/Product Memory tests 37/37 PASS, zero failures; Product Memory validator PASS for 32 existing records, ID counters unchanged. Truth comparison confirms only the two authorized status/acceptance references changed, with all implementation checkpoints, contracts and other capabilities preserved. Whitespace check PASS; only six documentation/acceptance files changed. No functional tests were rerun.

## 70. Final acceptance of remaining registered capabilities (2026-10-16)

Mazen explicitly confirmed that he personally tested and approved all three remaining features on TESTING in FINAL ACCEPTANCE OF REMAINING FEATURES, and authorized saving these decisions. Canonical Game Catalog/manual add-edit-remove is ACCEPTED at existing checkpoint `b4a93b5d9f0b948c3d706e5fc2cbef665c74e63e`; game-artwork-provisional is ACCEPTED within its current provisional scope at `0dd59a91b947571d5579c8ed61be5c94cb9dffc0`; root landing-page is ACCEPTED at `3cb0cde7f474cbe7efd194623c6c02853c3de365`. Implementation checkpoints, contracts, limits, surfaces and names remain unchanged. This is owner-reported manual acceptance; detailed test steps/devices were not supplied or invented.

Artwork remains PROVISIONAL / TESTING-only. Existing reliable matching/fallbacks, authorized routes, cache/lookup/rate limits, kill switch and outstanding SteamGridDB written-permission/release conditions remain. Acceptance does not grant a licence, public/commercial/Production release or wider provider scope. No external service, account or secret access was performed.

No PENDING_ACCEPTANCE capabilities remain in the resulting Truth snapshot; this does not accept unimplemented roadmap directions, resolve unrelated issues or authorize release/merge. New scoped Product Memory REV-0008 and INDEX record the three decisions; existing DIS-0002/REV-0007 were checked but do not cover these capabilities as a whole, so they are preserved without duplicate/expanded acceptance. Verified clean local/GitHub feature/play-together-notifications at ad9ed7bc0af077bb6d2bcbcc8589e9e031d9171f and all three original implementation ancestors before edits. Documentation/acceptance only: no product/test code, migrations, deployment, Production access or main merge. No new functional/manual tests run by the agent.

Acceptance-recording validation: Truth/Product Memory tests 37/37 PASS, zero failures; Product Memory validator PASS for 33 records (one necessary scoped REV-0008, no duplicates); only the REV counter advances from 0007 to 0008. Truth comparison confirms only the three authorized status/acceptance references changed, all checkpoints/contracts/limits preserved and PENDING_ACCEPTANCE count zero. Whitespace check PASS. Only seven documentation/acceptance files changed; product, test, migration and deployment files unchanged.

## 71. Mobile V2: the Profile Deck (2026-10-17)

Mazen authorized implementation and TESTING deployment of Mobile V2 ("GAMID — IMPLEMENT MOBILE V2: THE PROFILE DECK"), using the 11-board Profile Deck proposal and its recommended choices as the baseline. He wants to try it in his Android Emulator before final acceptance. Arabic / RTL was excluded: ten languages come later as one coordinated task.

Product `a0c7c95580e7e3375aa095fdc62de520059236ac` on feature/play-together-notifications, from verified clean `82c3cd6`:

- **What it is.** Below 1024px YOUR GAMID is now an identity hero, sticky section chips and six group cards following the Desktop pairs. One live editor at a time opens in a full-screen sheet (centred from 600px; About Me parts as tabs). A sticky bar holds the original Save All while anything is unsaved.
- **Drafts.** Back, Escape and Android / browser Back keep drafts. Crossing 1024px keeps every draft and the open editor.
- **Dialogs and layout.** Confirmations become bottom sheets below 600px. The 760–879px two-column overflow is gone.
- **How it is built.** It is a presentation layer (`mobile-editor.js` / `mobile-editor.css`) that moves the original section cards with restoration slots, like the Desktop editor. Saves, uploads, workflow actions, contracts, limits and privacy are unchanged. No backend, migration or infrastructure change.
- **Desktop.** `desktop-editor.js` / `.css` are untouched, and the Desktop editor is pixel-identical at 1024, 1280 and 1440.

Full contract, behavior and evidence: [docs/PROFILE-EDITOR-MOBILE-V2.md](docs/PROFILE-EDITOR-MOBILE-V2.md).

**Validation:**

- **Build:** 1917 tests, 1916 PASS, one opt-in SKIP, zero failures.
- **Mobile and tablet:** the deck review passes 24 cases (360, 375, 390, 430, 600, 768, 820 and 1023px × populated / rich / empty), with the full draft, save, boundary, Back, dialog and preview flow at every width.
- **Desktop regression:** the paired editor at 1024 and 1440, media review, Crew UX (35 cases) and Classic preview pass; 9 of 9 screenshots are byte-identical to the starting checkpoint.
- **Pre-existing test failure:** the old 390px path of `profile-editor-browser.mjs` was already failing at `82c3cd6`. Mobile coverage moved to `classic-preview-browser.mjs --mobile-deck`.
- **Scope of testing:** all backend traffic was mocked; no real or protected account was used. Chrome headless only; no Android device or Emulator test is claimed.

**Truth: UPDATED.**

- New capability `your-gamid-editor-mobile`, PENDING_ACCEPTANCE (checkpoint `a0c7c95`; contracts `profile-mobile-deck`, `profile-mobile-sheet`, `profile-mobile-save-bar`, `profile-mobile-boundary`).
- `your-gamid-editor` stays ACCEPTED with its checkpoint unchanged. Only the below-1024px wording of `profile-independent-sections`, `profile-save-all`, `profile-desktop-dashboard` and `profile-desktop-media` was reconciled, to point to Mobile V2.

No Product Memory record was created or changed.
TESTING delivery (2026-10-17): source `bceb676c1c64f599c980daa4ddc79be9f5dd0bdf` (product `a0c7c95` plus its records), [workflow 39001472361](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39001472361) SUCCESS, including the workflow's own full validation and smoke check. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/).

- **Served files:** ten served Account files match the checkpoint exactly (including `mobile-editor.js`, `mobile-editor.css`, `profile-editor.js` and the unchanged `desktop-editor.js` / `.css`); `index.html` carries the expected asset stamp `bceb676`.
- **Post-deploy review:** the deck review run against the served frontend (`--live`, mocked backend) passes at 360, 390, 430, 768 and 1023px × populated / rich, with the full draft, save, boundary, Back, dialog and preview flow. Desktop at 1024 and 1440 is byte-identical to the starting checkpoint.
- **Later commits:** this delivery note is documentation only; the deployed `dist` is unchanged and needs no redeployment.

**STOP for Mazen's Android Emulator review; PENDING_ACCEPTANCE, not ACCEPTED.**

## 72. Mobile V2 visual parity audit and fixes (2026-10-17)

Mazen authorized a comprehensive visual parity audit of Mobile V2 against the accepted Desktop editor, with targeted corrections ("GAMID — MOBILE V2 COMPREHENSIVE VISUAL PARITY AUDIT & FIX"). It consolidates his Android Emulator reports:

- Your Intro showed a generic tile instead of the saved Intro thumbnail.
- My Crew showed Crew names and letter placeholders without artwork.
- My Games showed initials instead of game artwork (his account: 14 games, 4/4 favorites).

Product `15e204dcc8e324de3d32efc1e747b041424f45aa`, from verified clean `7673872` on feature/play-together-notifications.

**Root cause.** Only the Desktop editor received the owner media configuration (Intro lease thumbnail, allow-listed provider photos, game-artwork matches applied to the live My Games and My Crew panels). Below 1024px Desktop removes its artwork, and the deck never added any. The source data and approved routes existed.

**What changed:**

- **Media.** The deck now gets the same configuration and uses the same helpers, guards and fallbacks.
- **Summaries.** They add the Desktop summary content: game names, rich Crew tiles (reused while unchanged), About Me values, the Duo badge, provider photos, and the saved location and bio.
- **Hero.** The name no longer sits on the Banner.
- **Width-boundary teardown.** It no longer calls `history.back()`. The Crew UX regression at 768→1440 showed that this asynchronous traversal could abort a following navigation.

Intentional mobile adaptations, the shared accepted Crew stylesheet, and games or Crews without matched artwork were classified and left unchanged.

- **Full table:** [docs/PROFILE-EDITOR-MOBILE-V2.md](docs/PROFILE-EDITOR-MOBILE-V2.md) → Visual parity audit.
- **Desktop.** `desktop-editor.js` / `.css` are unchanged. No backend, permission, privacy, limit or contract change, and no media made public, newly signed or generated.

**Validation:**

- **Build:** 1918 tests, 1917 PASS, one opt-in SKIP, zero failures.
- **Mobile V2 deck:** 36 cases PASS (320, 360, 375, 390, 430, 600, 768, 820 and 1023px × populated / rich / empty / failed media). They cover media and fallbacks, no idle image retries, no Intro playback, the hero text position, and the full flow at all nine widths.
- **Desktop:** 12 of 12 screenshots (1024, 1280, 1440 × four scenarios) are byte-identical to the pre-Mobile-V2 checkpoint `82c3cd6`. The paired editor at 1024 / 1440, media review, Crew UX (35 cases) and Classic preview all pass.
- **Evidence:** before / after captures show deployed `bceb676` versus the fix with the same fixture.
- **Scope of testing:** all backend traffic was mocked; no real or protected account was used.
- **Unverified:** the artwork matches for Mazen's real games and Crews, and his real Intro frame and Emulator rendering.

**Truth: UPDATED.**

- `your-gamid-editor-mobile` stays PENDING_ACCEPTANCE: checkpoint `15e204d`, new contract `profile-mobile-media`, and an updated `profile-mobile-deck` summary clause.
- `your-gamid-editor` stays ACCEPTED. Only the below-1024px sentence of `profile-desktop-media` that this branch had written now points to Mobile V2 media; the Desktop clauses and checkpoint are unchanged.

No Product Memory change. TESTING delivery: source `4786c5914f7dc8c42deb0d0f3da2f4430d4bd9e0`, [workflow 39007625520](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39007625520) SUCCESS. Twelve served files match the checkpoint exactly: the Account files, `editor-media.js`, `crew-editor.css`, the public artwork and Crew renderers, and `index.html` with stamp `4786c59`. The `--mobile-deck --live` review (served frontend, mocked backend) passes at 320, 390, 430, 768 and 1023 × populated / failed media. Desktop at 1024 and 1440 is byte-identical to `82c3cd6`. This note is documentation only; the deployed `dist` is unchanged. **STOP for Mazen's manual verification; PENDING_ACCEPTANCE, not ACCEPTED.**

## 73. Mobile V2 visual fixes: Mazen's manual acceptance (2026-10-17)

Mazen manually verified the Mobile V2 visual parity fixes from §72 (product `15e204dcc8e324de3d32efc1e747b041424f45aa`, TESTING `4786c5914f7dc8c42deb0d0f3da2f4430d4bd9e0`, run 39007625520). He used his real account in the Android Emulator and confirmed "كلها صحيحة" ("all of them are correct"). This covers:

- the actual saved Intro thumbnail;
- My Games artwork in the summary and editor;
- My Crew artwork in the summary and editor;
- the other parity-audit corrections.

He explicitly approved saving the result.

**Records:**

- **Product Memory:** new scoped review REV-0009 (ACCEPTANCE, PASS, reviewer Mazen) and the INDEX Register. No existing record covered Mobile V2; IDEA-0001 and REV-0004 stay Desktop-scoped and unchanged.
- **Truth:** in `your-gamid-editor-mobile`, only the record text changed, now noting this acceptance. Its status stays PENDING_ACCEPTANCE; its checkpoint, contracts and limits are unchanged. Every other capability is unchanged, including `your-gamid-editor` (ACCEPTED, Desktop).

**Scope:** documentation and Product Memory only. No test was rerun by the agent, and no device details were supplied or invented. No product code, backend, database, infrastructure, deployment, merge or Production access. The animated Intro rotation icon is not authorized. **Overall Mobile V2 is not accepted.**

## 74. Mobile Intro landscape rotation hint (2026-10-17)

Mazen authorized implementing, testing and deploying to TESTING a TikTok-inspired animated phone-rotation hint for the mobile Intro player ("GAMID — MOBILE INTRO LANDSCAPE ROTATION HINT"). Product `30653d1678a9cd319d5e31ac94ec729bb1648341` on feature/play-together-notifications, from verified clean `a765099`. Follow-up `c3113d0e887ee12878fdd9ec6e09501728c72749` only restores LF line endings in `intro-preview.html`; the content is unchanged.

**Where it lives.** The shared Intro player `account/intro-preview.html` / `.js` is used by the public visitor Intro and the editor's Preview Intro. The editor's Intro thumbnail is unchanged.

- **New:** `intro-landscape.js`, the hint and Exit buttons inside the existing Intro layer, and styles in `intro-preview.css`.
- **Changed:** both Intro iframes now `allow="autoplay; fullscreen"`.

**Behavior.**

- **Display.** The hint appears once per presentation, only for landscape videos (ratio ≥ 1.2, after metadata) on a portrait touch screen. It sits bottom-left, clear of every control. The phone turns 0° → 90°, fades from 2.6 s and is gone at 3 s. With reduced motion it is static.
- **Tap.** A tap puts the existing Intro layer in fullscreen and tries `screen.orientation.lock('landscape')`; a refused lock keeps fullscreen.
- **Playback.** Never touched: paused stays paused; playing keeps position, volume and mute.
- **Exit.** Exit fullscreen, system Back, Skip, stop and the Intro end leave fullscreen and unlock. The end transition waits until fullscreen has closed.
- **No Fullscreen API** (e.g. iPhone Safari): the hint is a manual-rotation cue.
- **Unchanged:** manual Play, the contain-fit video, the ambient background and Desktop.

Details: [docs/INTRO-LANDSCAPE-HINT.md](docs/INTRO-LANDSCAPE-HINT.md).

**Validation:**

- **Build:** 1924 tests, 1923 PASS, one opt-in SKIP, zero failures (new `tests/intro-landscape.test.js`).
- **Pinned-markup test.** The `public-section-visibility` test pins the public Intro iframe markup; it now expects the new `allow` list. Its intent (the panel never touches the Intro) is unchanged.
- **`scripts/intro-landscape-browser.mjs`:** run twice, all PASS (Chrome mobile emulation, real player in a host iframe with the production `allow` list).
  - **Widths:** 320, 360, 390, 430 and 768px.
  - **Covers:**
    - appearance, rotation and the 3 s window;
    - no overlap or overflow;
    - paused and playing fullscreen with no `play()` call;
    - Skip from fullscreen;
    - the end in fullscreen;
    - portrait / square clips get no hint;
    - no timer leaks;
    - reduced motion;
    - landscape phone and Desktop (no hint).
- **Mobile V2 deck:** 36 cases PASS, now including Preview Intro → Return to editor / Skip.
- **Desktop:** 12 of 12 screenshots are byte-identical to `82c3cd6`. The paired editor, Classic preview, media review and Crew UX (35 cases) pass.

**Truth: UPDATED.** New capability `intro-landscape-hint` PENDING_ACCEPTANCE (checkpoint `c3113d0`, contracts `intro-landscape-hint-display` and `intro-landscape-fullscreen`). `intro-identity` and every other capability are unchanged.

No Product Memory change.

TESTING delivery: source `d10ca52e5d20e6d6745e726945a931ca4ba71af9` (product `c3113d0`), [workflow 39013335904](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39013335904) SUCCESS. Ten served files match the commit exactly (Intro player HTML / JS / CSS, `intro-landscape.js`, both host pages, `styles.css`, `video-fit.js`, Mobile V2 and Desktop editors). The `--live` hint review passes 8 of 8.

**Real-device check (Android Emulator `Medium_Phone`, Chrome 154, deployed public Intro of @black as a read-only visitor, in new tabs; nothing played, saved or signed in):**

- **Verified:**
  - landscape Intro with manual "Tap to play" and no autoplay;
  - the hint appears bottom-left about 2.3 s after opening, with the phone in portrait, turned to landscape by about 3.8 s, and gone by 6.1 s;
  - no overlap with Tap to play, Skip or the progress bar.
- **Not verified:** fullscreen / orientation lock on the device. The single scripted tap landed in the hint's final fade, and the page did not enter fullscreen. Whether the tap came after the hint's dismissal could not be established: the emulator then exited, and was not relaunched.
- **Leftovers:** eleven small screenshot files (`/sdcard/gamid-*.png`) and a few @black tabs remain in that emulator's Chrome.

**STOP for Mazen's manual acceptance; PENDING_ACCEPTANCE, not ACCEPTED.**

## 75. Intro landscape hint: two targeted refinements (2026-10-17)

Mazen tested the hint in the Android Emulator and confirmed that it looks good, that the tap opens the Intro in landscape fullscreen, and that the video and cinematic presentation work. He requested exactly two refinements. Product `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3` on feature/play-together-notifications, from verified clean `467b71a`.

**A. Six-second window.** `HINT_MS` changed from 3000 to 6000, and `HINT_FADE_MS` from 400 to 500, with the CSS fade at 0.5 s. The hint is now fully visible for 5.5 s, fades for 0.5 s while still tappable, and is gone at 6 s. Unchanged:

- the rotation animation and styling;
- eligibility and one showing per presentation;
- no looping;
- reduced motion (static).

As before, the Intro's own end or a Skip removes it sooner.

**B. Chrome's fullscreen notice** ("<host> — To exit full screen, press Esc"). This is browser-owned security UI.

- **The standard.** The Fullscreen API Standard §8 asks browsers to make fullscreen evident and to advertise an exit that always works.
- **What a page can pass.** `FullscreenOptions` offers only `navigationUI` (already `"hide"`) and `keyboardLock` (which would only change the wording).
- **No suppression.** No supported site API, header or configuration suppresses it, and DOM / CSS cannot reach browser chrome.
- **Frequency is already minimal.** Fullscreen is entered only on an explicit tap, once per entry, and is never re-requested.

No code change and no replacement notice were made for B; it is documented in [docs/INTRO-LANDSCAPE-HINT.md](docs/INTRO-LANDSCAPE-HINT.md).

**Validation:**

- **Build:** 1925 tests, 1924 PASS, one opt-in SKIP, zero failures (new tappable-while-fading unit test).
- **Hint review:** 320, 360, 390, 430 and 768px, plus reduced motion, landscape phone and Desktop: PASS. The fade was measured at about 5.5 s (5493 ms at 390), removal at 6 s (about 6.3 s including polling), and a tap during the fade enters fullscreen. The test's 4 s generated clips are paused for the timing steps, because the Intro's end correctly removes the hint.
- **Mobile V2 deck:** 18 cases (9 widths × populated / rich), including Preview Intro Return / Skip: PASS.
- **Desktop:** 12 of 12 screenshots are byte-identical to `82c3cd6`. The paired editor, Classic preview and media review pass.

**Truth: UPDATED.** In `intro-landscape-hint` (still PENDING_ACCEPTANCE): checkpoint `77cfe4f`; the display contract now gives the 6 s timing; the fullscreen contract notes that the browser-owned notice cannot be suppressed.

No Product Memory change.

TESTING delivery: source `be6fa4ba93aa40c006b514eb45b7475112d0c0aa` (product `77cfe4f`), [workflow 39021570794](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39021570794) SUCCESS. Eight served files match the commit exactly. The `--live` hint review passes at every width: the fade starts at 5.50–5.52 s and a tap during the fade enters fullscreen.

**Android Emulator (Chrome 154; deployed public Intro of @black as a read-only visitor, in new tabs; nothing played or saved):**

- **Timing:** the hint, still visible 4.9 s after it appeared, is gone about 0.6 s later, so the window is about 5.5–6 s (it was 3 s).
- **Tap:** a tap late in the window entered landscape fullscreen (display rotation 90°), with Exit fullscreen, Skip and Tap to play present.
- **Chrome's notice:** "gamid-testing-static.gamid.workers.dev – To exit full screen, press Esc" appeared, as documented.
- **Back:** returned to the portrait Intro (rotation 0), still paused, with no autoplay.
- **Cleanup:** the screenshot files from both device checks were removed from the emulator. A few @black tabs remain open in its Chrome.

**STOP for Mazen's manual verification; PENDING_ACCEPTANCE, not ACCEPTED.**

## 76. Intro landscape hint: provisional approval (2026-10-17)

Mazen reviewed the deployed refinement (`be6fa4b`, §75) in the Android Emulator. He confirmed that:

- the hint is visually correct;
- the 6-second timing is approved;
- tap → landscape fullscreen works.

Chrome's native fullscreen security notice is acknowledged as a browser-controlled limitation, not a GamID defect. He approved the Intro refinement **provisionally** so work can proceed; this is not unconditional final acceptance.

**Truth: UPDATED** (record text only). `intro-landscape-hint` stays PENDING_ACCEPTANCE; Truth has no provisional status. The checkpoint (`77cfe4f`), contracts and every other capability are unchanged.

Documentation only: no Intro code change, no attempt to suppress the browser notice, no deployment. No Product Memory change.

## 77. Mobile Public Visitor V2 (2026-10-17)

Mazen's task "GAMID — PROVISIONAL INTRO ACCEPTANCE + MOBILE PUBLIC VISITOR V2", Phase 2. Product `ace098218bef771cd5b34afff2a9681cb4afb4b3` on feature/play-together-notifications, from verified clean `e71779c`. Phase 1 is recorded in §76.

Below 1280px, without a published, enabled Wall, `/@handle` now draws the Classic Profile itself, in one mobile-first column, using the desktop's own components and exactly the public data the server already sends:

- the hero, with a stats row of real public counts: games when public, Crews, Duo;
- adaptive My Socials with brand marks (a connected Discord without a link inside it);
- My Duo, My Crews, Steam;
- About Me;
- Favorite Games (a swipe row on phones, four columns from 600px);
- Connected Games (League);
- My Games with tiles;
- Replay Intro.

**Intro, Wall and Desktop.**

- **Intro:** the frame only plays the Intro and reveals the page profile (hostReveal), as on the desktop. Skip, Back / Skip Intro, Replay and the landscape hint are unchanged.
- **Wall and breakpoint:** a published Wall still replaces the profile, and crossing 1280px switches layouts in place with no replay.
- **Desktop:** the CSS is untouched; the desktop marks were copied, not moved.
- **Backend:** no backend, RPC, visibility, privacy or data-contract change.
- **Full detail:** the design, the Desktop → Mobile parity checklist and the adaptive-icon table are in [docs/PUBLIC-VISITOR-MOBILE-V2.md](docs/PUBLIC-VISITOR-MOBILE-V2.md).

**Validation:**

- **Build:** 1930 tests, 1929 PASS, one opt-in SKIP, zero failures, including the new `tests/public-mobile-v2.test.js`.
- **Updated guard tests.** Six pinned the former "mobile visitor untouched" wiring; they now assert the Mobile V2 contract with dated notes and keep their desktop assertions:
  - `classic-profile-redesign`;
  - `classic-profile-visual-review`;
  - `intro-preview-editor-end`;
  - `gaming-roles-favorites-crews`;
  - `wall-crews-block`;
  - the `classic-preview-browser.mjs` 390px Classic Preview branch.
- **`scripts/public-mobile-browser.mjs`:** all PASS, with synthetic data and mocked anonymous reads.
  - **Rich profile** at 320, 360, 375, 390, 430, 600, 768, 1023, 1024 and 1152px:
    - every section present;
    - no overflow;
    - 44px touch targets;
    - brand marks without letters.
  - **Socials:** 1 / 2 / 3 / 5 / 8 / 12 accounts at 320 / 390 / 768 (size never grows with more accounts, rows balanced).
  - **Interactions:** stats, My Crews, Favorite / Connected / My Games details, links.
  - **Crossing:** 390 → 1440 → 390 without a replay.
  - **Other scenarios:** empty profile, Intro → Skip → Replay, published Wall, reduced motion.
- **Desktop:** 1280 / 1440 / 1920 are byte-identical to `e71779c` in 3 of 3 runs, with raster images masked: Chrome's image rasterisation varies by one colour unit between runs, measured inside the cover images.
- **Other suites:** Crew UX (35), media review, the Desktop editor, the owner Mobile V2 deck, the Intro hint suite and Classic preview pass.

**Truth: UPDATED.**

- New `public-profile-mobile-v2` PENDING_ACCEPTANCE (checkpoint `ace0982`; contracts `public-mobile-layout`, `public-mobile-intro`, `public-mobile-socials`).
- The mobile clauses of accepted contracts now point to it, with their desktop clauses and statuses unchanged:
  - `classic-profile-desktop`: `desktop-my-crew`, `desktop-connected-games`, `desktop-social-marks`, `desktop-preserves`, `desktop-discord`;
  - `about-me`: `about-me-display`;
  - `favorite-games`: `favorite-games-public`;
  - `my-socials`: `socials-public-display`.

TESTING delivery: source `2889d3b44197751efe16617736b514117d3875da` (product `ace0982`), [workflow 39025962088](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39025962088) SUCCESS. Ten served files match the commit exactly (public page, `public.js`, `public-mobile.js`, `public.css`, `public-desktop.js`, the Intro player and the owner editors), and `/@black` serves the new page. The `--live` review (served frontend, mocked backend) passes at 320, 390, 430, 768 and 1023px, plus interactions, crossing, empty, Intro, Wall and reduced motion. This note is documentation only; the deployed `dist` is unchanged.

Product Memory: proposal only, not saved. **STOP for Mazen's manual acceptance.**

## 78. Final acceptance of Mobile Public Visitor V2 (2026-10-17)

Mazen explicitly approved the current Mobile Public Visitor V2 implementation (task "GAMID — FINAL ACCEPTANCE: MOBILE PUBLIC VISITOR V2"). This section records it; it is documentation only.

- **Accepted:** product checkpoint `ace098218bef771cd5b34afff2a9681cb4afb4b3`, deployed to TESTING as `2889d3b44197751efe16617736b514117d3875da` (run `39025962088`, §77).
- **Unchanged:** product code, UI, the deployed TESTING version, the backend, database and infrastructure. No deployment, merge or Production access.
- **Still pending:**
  - `intro-landscape-hint` stays PENDING_ACCEPTANCE: Mazen's approval of it is provisional (§76), and Chrome's "To exit full screen" notice remains a documented browser limitation (§75, `docs/INTRO-LANDSCAPE-HINT.md`);
  - `your-gamid-editor-mobile` stays PENDING_ACCEPTANCE (its visual fixes accepted in REV-0009, §73).

**Truth: UPDATED.**

- `public-profile-mobile-v2` PENDING_ACCEPTANCE → ACCEPTED; its record notes the acceptance. Checkpoint and contracts unchanged.
- The eight mobile clauses that pointed to it (`classic-profile-desktop`: `desktop-my-crew`, `desktop-connected-games`, `desktop-social-marks`, `desktop-preserves`, `desktop-discord`; `about-me-display`; `favorite-games-public`; `socials-public-display`) now say ACCEPTED instead of PENDING_ACCEPTANCE. Nothing else changed.

Product Memory: no record saved. **STOP.**

## 79. Final acceptance of the Intro landscape hint (2026-10-17)

Mazen explicitly accepted the currently deployed Intro landscape hint and fullscreen behavior exactly as implemented (task "GAMID — FINAL INTRO ACCEPTANCE & PRODUCT MEMORY SAVE"), superseding his provisional approval (§76). Documentation only.

- **Accepted:** checkpoint `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3` (§74–§75): the hint, its 6-second window, tap-to-landscape fullscreen where supported, and the existing playback, transitions and controls. First delivered to TESTING as `be6fa4b` (run `39021570794`); the Intro code is unchanged in the current TESTING `2889d3b`.
- **Chrome's fullscreen notice:** a browser-controlled limitation. It shows the page origin, not the Intro path or title. A shorter future custom origin is expected to shorten the displayed address, but the notice remains. Domain migration is not authorized.
- **Isolated experiments (Chrome 154, Android Emulator, outside the repository):**
  - every real-fullscreen variant showed the notice;
  - orientation lock without fullscreen is refused;
  - an inline player (the real player in its iframe, without the fullscreen permission) showed no notice, but it gave no automatic rotation and a smaller video under Chrome's address bar.

  Current fullscreen is retained.
- **Unchanged:** product code, the deployed TESTING version, backend, database and infrastructure. No deployment, merge, domain or Production change.
- **Still pending:** `your-gamid-editor-mobile` (§71–§73, REV-0009).

**Truth: UPDATED.** `intro-landscape-hint` PENDING_ACCEPTANCE → ACCEPTED; its record notes the final acceptance and the Chrome notice limitation. Checkpoint, contracts and limits unchanged; nothing else changed.

**Product Memory: SAVED** (Mazen's approval, 2026-10-17): new REV-0011, Register row and REV counter in `product-memory/INDEX.md`. **STOP.**

## 80. My Wall Desktop Visual Redesign, Phase 1 (2026-10-18)

Mazen authorized Phase 1 of a fantasy-gaming visual redesign of the **desktop** Wall Editor (viewport 900px and wider), following his reference image: the outer shell, the editor's interface icons and the Add panel. Details, scope, validation and deviations: [`docs/WALL-EDITOR-DESKTOP-REDESIGN.md`](docs/WALL-EDITOR-DESKTOP-REDESIGN.md).

- **Product:** `716b4e74df33b9bd50ee2f802dea2442f69a001a`. New `dist/wall-editor/editor-desktop.css`, linked with `media="(min-width: 900px)"`; one supporting line in Add (`index.html`) and one hiding rule below 900px (`editor.css`). No JavaScript, behavior, data, Properties, Layers, stage, renderer, mobile or public change.
- **TESTING:** source `716b4e74df33b9bd50ee2f802dea2442f69a001a`, run `39044158099`, served files exact. Backend unchanged.
- **Validation:** `npm run build` 1938 tests, 1937 passed, 1 skipped, 0 failed; new `tests/wall-editor-desktop-ui.test.js` (8 tests); 16 phone / tablet editor states byte-identical to `HEAD`; one 27-step scripted session identical on both builds; no overflow or clipping from 900×700 to 2560×1440.
- **Not invented:** the reference's zoom, Guides / Snap, stage thumbnail strip, canvas-size label, Add search and header stage tabs are not existing features and are not added.
- **Status:** awaiting Mazen's visual review. Phase 2 is not authorized.

**Truth: NO CHANGE REQUIRED** (cosmetic only; no capability, status, limit, contract or checkpoint changed).

Product Memory: proposal only, not saved. **STOP for Mazen's visual review.**

## 81. My Wall Desktop Text & Fonts Upgrade, Phase 2 (2026-10-18)

Mazen authorized Phase 2: the desktop Text panel as a curated typography library, and eleven new fonts. His task also states that the Phase 1 appearance (§80) is visually approved; it is preserved. Details, licences and validation: [`docs/WALL-EDITOR-TEXT-FONTS.md`](docs/WALL-EDITOR-TEXT-FONTS.md).

- **Product:** `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d`.
- **Fonts:** Cinzel Decorative, UnifrakturCook, Pirata One, Eagle Lake and Metal Mania (Fantasy & Gothic); Great Vibes, Alex Brush, Pinyon Script, Italianno, Tangerine and Ballet (Luxury Signature & Script).
  - All are SIL OFL 1.1, verified against `github.com/google/fonts`.
  - They are the official Google Fonts WOFF2 latin subsets, unmodified and self-hosted; licences are in `dist/wall-kit/fonts/LICENSES.txt` and `OFL-NOTICES.txt`.
  - No blocker; nothing was substituted.
- **Data:** stable catalog keys. The validator and the database (`private.wall_element_payload_errors`) check only the key format, so there is **no migration and no backend change**.
  - The 12 existing fonts are unchanged; only the group label `System` became `System & Classic`.
  - Unknown keys still fall back safely.
- **Panel (desktop, 900px and wider):** presets as cards, search by name, four categories, two-column cards with a live sample in each font, and a purple / gold current state (`aria-current`).
  - Font files load lazily (`font-display: swap`; cards get their family near the visible panel).
  - Phone and tablet keep their lists; the new fonts appear there in the existing style and in the Properties select.
- **TESTING:** source `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d`, run `39101612969`, 27 of 27 served files byte-identical. Backend unchanged.
- **Validation:**
  - `npm run build`: 1948 tests, 1947 passed, 1 skipped, 0 failed.
  - New `tests/wall-text-fonts.test.js` (10 tests); the Phase 1 guard test was updated for the Text panel scope.
  - Lab end to end: create, font, save, reload, Preview and public paint, all 11 faces loaded.
  - 15 panel-behavior checks.
  - 56 other tool-panel states unchanged versus the previous build; the 27-step behavior transcript is identical.
- **Status:** awaiting Mazen's visual review and final acceptance. Phase 3 is not authorized.

**Truth: NO CHANGE REQUIRED** (no capability, status, limit, contract or checkpoint changed; Truth records no font list).

Product Memory: proposal only, not saved. **STOP for Mazen's visual review.**

## 82. Font category accordions; Upload My Font proposal (2026-10-18)

Mazen's task "GAMID — My Wall Desktop Text: Accordion + Custom Font Upload", with his additional "User-Owned Font Storage & Usage" requirements.

- **Implemented: category accordions** (desktop, 900px and wider; `dist/wall-editor/tools.js`, `editor-desktop.css`).
  - All four categories start collapsed, each heading is a button with the real count and a chevron, and several may be open.
  - Search covers collapsed categories and restores the states afterwards.
  - Keyboard, focus, the current-font highlight and lazy loading are kept, and phone and tablet are unchanged.
  - Details and validation: `docs/WALL-EDITOR-TEXT-FONTS.md`.
- **Not implemented: Upload My Font.** It requires a new storage bucket, a table with RLS and RPCs, a published-read policy extension and Edge Function changes, which the task's gate reserves for Mazen's separate approval. No upload UI was added. The proposal, storage accounting (inside the existing 200 MB per-account quota) and costs (no new paid service) are in the same document.
- **Validation:** `npm run build` gives 1949 tests, 1948 passed, 1 skipped, 0 failed. The accordion browser checks pass, 59 regression states are unchanged, and the behavior transcript and font lifecycle are identical.

**Truth: NO CHANGE REQUIRED** (a presentation change; no capability, limit or contract changed; the upload capability does not exist).

Product Memory: proposal only, not saved. **STOP for Mazen's review and his decision on the font-upload proposal.**

## 83. Custom Wall fonts: Upload My Font and My Fonts (2026-10-18)

Mazen approved implementing the documented custom-font architecture (§82) on TESTING, with **at most 3 active custom fonts per account**. Implementation, security design and full evidence are in `docs/WALL-EDITOR-TEXT-FONTS.md` (section "Custom fonts: implemented").

- **Product:** `875bd2dfe6e194816500f262d7aedeabc14d0f58`.
- **Database:** migration `20261018120000_wall_custom_fonts` **APPLIED** on TESTING, after a rolled-back rehearsal in which every assertion passed (service role, GM-TEST-01 / GM-TEST-02 by SQL impersonation, anonymous visitor). State was verified unchanged afterwards, then the migration was applied and the history repaired.
  - **Adds:** the private `wall-fonts` bucket (2 MiB, WOFF2), the `wall_fonts` registry (RLS, owner RPCs, service-only registration) and the published-fonts visitor policy and RPC.
  - **Patches in place (asserted):** `reserve_usage_upload` (the bucket and the 3-font limit), `authorize_usage_delete` (registered fonts) and `get_my_usage_impl` (Custom Fonts n / 3).
  - **Also adds:** the draft fontRef check, a restrictive delete policy for registered fonts and a `font` usage category.
- **Edge Function:** `usage-upload` **v10** (deployed after confirming v9 matched the previous repository version; the v10 download is byte-identical to the repository). WOFF2 structural validation and SHA-256 naming come before any reservation; it then reserves, stores, completes and registers, rolls back a refused registration and cleans up orphans.
- **TESTING static:** source `875bd2dfe6e194816500f262d7aedeabc14d0f58`, run `39125819357`, 12 of 12 changed files byte-identical.
- **Verified live:**
  - a race for the last slot has exactly one winner (synthetic receipts, then removed);
  - anonymous probes are refused (401 / 403 / 42501);
  - `@black` is unaffected.
- **Not done by the agent:** a real upload with a signed-in account (protected accounts; personas are never signed into). That is Mazen's acceptance step.
- **Validation:** `npm run build` 1976 tests, 1975 passed, 1 skipped, 0 failed. New `tests/wall-custom-fonts.test.js` (17) and `tests/wall-custom-fonts-db.test.js` (10, the real migration on PGlite). The guard tests got explicit, checked allowances for this migration and its visitor RPC. Lab UI: 18 checks pass; regression: 59 states unchanged, behavior transcript identical.

**Truth: UPDATED.** New `custom-wall-fonts` **PENDING_ACCEPTANCE**:

- limits `maxCustomFontsPerAccount` 3 and `maxFontBytes` 2097152;
- six contracts: upload, limit, storage, use, visitor access, delete;
- checkpoint `875bd2dfe6e194816500f262d7aedeabc14d0f58`.

Nothing else changed.

Product Memory: proposal only, not saved. **STOP for Mazen's acceptance.**

## 84. Custom fonts: TTF and OTF upload (2026-10-18)

Mazen's task "GAMID — Custom Font Upload: Add TTF & OTF Support". Details and evidence: `docs/WALL-EDITOR-TEXT-FONTS.md` (section "TTF and OTF upload").

- **Product:** `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`. **No migration.** The stored file is still a validated WOFF2, at most 2 MiB, so the bucket, quota, the 3-font limit, deduplication, the licence, RLS, deletion protection and visitor access are unchanged.
- **Approach (no new service, dependency or cost):** the Edge runtime's own `node:zlib` Brotli (verified live by the new data-free `usage-upload/capabilities` round trip). It is used with a small spec-compliant WOFF2 packer (null transform) that copies every validated sfnt table unchanged and executes nothing; the output is re-validated.
  - TTF / OTF sources may be up to 8 MiB.
  - Collections and WOFF 1 are refused.
  - Brotli is loaded defensively (`FONT_CONVERSION_UNAVAILABLE` otherwise).
- **Hardening found while verifying in Chrome:** WOFF2 files must end exactly at their last block, zero-padded to 4 bytes (the reference decoder's rule); `validateWoff2` now enforces it.
- **Edge Function:** `usage-upload` v12 (v10 confirmed equal to the previous repository version first; the v12 download is byte-identical to the repository).
- **TESTING static:** source `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`, run `39127878054`, changed files byte-identical.
- **Validation:**
  - `npm run build`: 1986 tests, 1985 passed, 1 skipped, 0 failed.
  - New `tests/wall-custom-fonts-convert.test.js` (10) with genuine OFL fixtures (Imperial Script TTF, Source Sans 3 OTF).
  - Chrome renders the converted fonts pixel-identical to the originals.
  - Lab UI checks pass; 59 regression states unchanged; behavior transcript identical.
  - Live: `capabilities` conversion true, an unauthenticated upload 401, a foreign origin 403.
- **Not done by the agent:** a real conversion upload with a signed-in account (Mazen's acceptance step).

**Truth: UPDATED.** `custom-wall-fonts` (still PENDING_ACCEPTANCE):

- contract `custom-font-upload` now covers WOFF2 / TTF / OTF and server-side conversion;
- new limit `maxFontSourceBytes` 8388608;
- checkpoint `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`.

Nothing else changed.

Product Memory: proposal only, not saved. **STOP for Mazen's acceptance.**

## 85. Desktop Text editor: Text Effects, Properties accordion; Living Fire V3 readiness (2026-10-18)

Mazen's task "GAMID — Desktop Text Editor Upgrade: Text Effects + Living Fire V3 + Accordion Properties". Details and evidence: `docs/WALL-EDITOR-TEXT-EFFECTS.md`.

- **Phase A, product:** `5a5a31239ff117e6a3c93209547490043ec206e6`. It is desktop only (900px and wider) and has no database, Edge Function or saved-format change.
  - **Text panel order:** Add Text (desktop wording: these add text boxes), Font Library, Text Effects (new), My Fonts, and Upload My Font at the bottom (shorter copy, the same rules).
  - **Text Effects:** Neon toggles the existing glow and opens Text Effects in Properties. Living Fire is a disabled "Coming soon" card and is **not integrated**.
  - **Text Properties:** five independent sections (Content & Typography, Text Effects, Position & Size, Arrange, Align to Stage) with the same controls. Their open state is kept across selections, and they are keyboard operable.
- **TESTING static:** source `5a5a31239ff117e6a3c93209547490043ec206e6`, run `39131378232`; changed editor files byte-identical.
- **Validation:**
  - Tests: 1990 tests, 1989 passed, 1 skipped, 0 failed.
  - Lab: 59 regression states and phone / tablet text Properties are pixel-identical, and the other element types' desktop Properties are identical.
  - The behaviour transcript is identical, and the My Fonts and TTF / OTF walk-throughs pass.
- **Phase B:** the Living Fire V3 readiness report is in the doc.
  - The three variants are one engine and one shader (`uDirection`), so all three can be offered as selectable variants.
  - Phase C needs a payload field plus a migration, a per-element renderer, a context strategy, a Worker for the SDF, and visitor rendering with a fallback.
- **Not done:** Phase C, which waits for Mazen's choice of variant(s) and his authorisation.

**Truth: NO CHANGE REQUIRED.** This is a presentation change of the desktop editor: the existing glow, no new capability, limit or contract, and Living Fire not integrated.

Product Memory: no record saved. **STOP for Mazen's acceptance of Phase A and his Living Fire variant decision.**

## 86. Living Fire V3 Phase C: integrated (2026-10-19)

Mazen's task "GAMID — Living Fire V3 Phase C" (2026-10-18), resumed after two interruptions. Variants: Organic (default), Cinematic and Mythic. Details, measurements and rollback: `docs/WALL-EDITOR-TEXT-EFFECTS.md` (Phase C).

- **Product:** `5c0371f3b47b256918aa6cb3c0768c679d584f1f`.
  - The V3 shaders and EDT are verbatim (hash-pinned).
  - New files: `dist/wall-kit/living-fire.js`, `living-fire-engine.js` and `living-fire-sdf.js`.
  - Wired through `paint.js`, so the editor, Preview and the published Wall share it.
  - Controls are in the desktop Text Effects section; the phone UI is unchanged.
- **Audit first, passed:**
  - Fire costs about +13.9 KB on a first visit to a fire Wall; a Wall without fire pays about +3.5 KB for `living-fire.js` and the small paint / text / CSS growth.
  - A mid GPU holds 28.8 fps at 24 fire texts. Software rendering limits it, so the shipped design is: at most 4 live, an adaptive budget, and still frames for the rest.
  - The 787 ms shader compile is non-blocking; the 0.13–0.19 s context creation is deferred to idle; fire causes no layout shift.
- **Database:** additive migration `20261019100000_wall_text_living_fire`, functions only: `private.wall_fire_ok`, revoked from the API roles, plus `INVALID_FIRE` in `private.wall_text_payload_errors`.
  - **Rehearsal:** in a rolled-back transaction with the W2 contract test. The corpus is 621 entries (+15 fire), and the database matches JavaScript on all of them.
  - **Applied:** on TESTING, then recorded with `migration repair`.
  - **Live check (rolled back):** a fire Wall saved, published and read by `anon`. GM-TEST-01 was verified unchanged afterwards.
- **Contract test, already failing before this work:** the same 5 W2 contract steps fail at HEAD `4e59f20` without this migration. Four are storage-visibility steps, and one is the persistence step for two corpus `fontRef` placeholders now refused by the custom-fonts ownership trigger. They are not caused by Living Fire and are left as they are (proposed as a Product Memory issue).
- **TESTING static:** source `5c0371f`, run `39147118537`; 9 of 9 changed files are served byte-identical.
- **Validation:**
  - 2000 tests (1999 passed, 1 skipped); lint and typecheck pass. `typecheck:prototypes` was split out, chained, for the Windows command-line limit.
  - Lab: the editor walk-through (18 / 18), fallbacks, a custom TTF with fire, and the regression against `4e59f20` (59 states pixel-identical; Properties, transcript, My Fonts and TTF / OTF unchanged).

**Truth: UPDATED.**
- New capability `living-fire-text`, PENDING_ACCEPTANCE.
- Limits: `fireStyles` 3, `maxFireTextCharacters` 80, `maxLiveFireAnimations` 4.
- Four contracts; checkpoint `5c0371f`; `updated` 2026-10-19.

Product Memory: proposals only, not saved. **STOP for Mazen's final acceptance.**

## 87. Living Fire bounding box fix (2026-10-19)

Mazen's report: Living Fire letters were much wider than the selection box. Details: `docs/WALL-EDITOR-TEXT-EFFECTS.md` ("Bounding box fix").

- **Root cause:** Living Fire always drew the text on ONE line at full size, ignoring the box width; the painted text wraps at it.
- **Fix:** the letter mask uses the painted text's own lines, alignment and line boxes, and the V3 frame is pinned to the box corner. The shader, styles and tuning are unchanged.
- **Product:** `24e2d78a35cd5e2605014da700ebd568de85e8b7`, TESTING run `39150052877`, served files exact.
- **Validation:**
  - 2002 tests (2001 passed, 1 skipped);
  - editor walk-throughs 18 / 18 and 14 / 14;
  - 59 screen states pixel-identical.

**Truth: NO CHANGE REQUIRED.** No capability, limit or contract changed; the contracts never stated one line. No database change.

Product Memory: no candidates beyond those already proposed in §86. **STOP for Mazen's visual acceptance.**

## 88. Living Fire bounding box fix accepted (2026-10-19)

Mazen personally tested the Living Fire bounding-box fix on TESTING and explicitly accepted it (fix `24e2d78`, documentation `9893964`, run `39150052877`; §87). The accepted behaviour:
- the fire follows normal text's wrapping, line breaks and alignment, inside the selection box;
- move, resize and rotation work;
- Organic, Cinematic and Mythic keep their approved visuals;
- Editor, Preview and the published Wall are consistent;
- normal text, Neon and the mobile UI are unchanged.

Recorded in Product Memory **REV-0012** (new; no earlier Living Fire record existed). Documentation only: no code, database, infrastructure or deployment change.

**Truth: NO CHANGE REQUIRED.** This accepts a bug fix, not the capability: `living-fire-text` stays PENDING_ACCEPTANCE, with its checkpoint, limits and contracts unchanged.

Product Memory: SAVED REV-0012. **STOP.**

## 89. Desktop Media & Links and Icon Group Properties refinement (2026-10-19)

Mazen's task "GAMID — Desktop Media & Links / Icon Group UI Refinement": organisation and look only, desktop only. Details: `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (Media & Links and Icon Group Properties).

- **Product:** `0615a4cc1a082bdaafc82d7eee18c9594de822e7`, TESTING run `39153509185`, served files exact.
- **What changed:**
  - Media & Links: an even two-column grid of equal-height cards; modes wrap in whole pieces (desktop only); the open form is framed.
  - Icon Group Properties: five accordion sections with every existing control. Move to stage stays first (the accepted rule).
- **Validation:**
  - 2005 tests;
  - Icon Group walk-through 20 / 20;
  - phone / tablet pixel-identical;
  - other Properties identical.

**Truth: NO CHANGE REQUIRED.** The organisation is cosmetic; `wall-icons` contracts (edited in Properties; Icon size, Spacing and Align adjustable; 24 icons) are unchanged and still true.

Product Memory: no record saved (needs Mazen's separate approval). **STOP for Mazen's visual acceptance.**

## 90. My Wall desktop Shapes V2 (2026-10-19)

Mazen's task "GAMID — MY WALL DESKTOP SHAPES V2". Details: `docs/WALL-EDITOR-SHAPES-V2.md`.

- **Product:** `f77e76e` (feature), `b08d538` (line endings only) and `da7dd1c1813d29ab9dc4068e626216af97e69e23` (handles hidden while points are edited).
- **TESTING static:** run `39194776098`; 12 of 12 changed files byte-identical.
- **Features (desktop):**
  - a 38-shape vector library in 6 categories plus Freeform;
  - the Freeform pen and Edit Points;
  - Smart Shape parameters;
  - Lock aspect ratio (drags and typed Width / Height);
  - the Shape Properties accordion (Move to stage stays first).
- **Data:** optional fields of the existing `rect` element (`shape`, `params`, `path`, `lockAspect`, in `dist/wall/shapes.js`).
  - Old Walls paint unchanged.
  - The database already stores these fields unchanged (rolled-back live contract run: 627 entries, no new mismatches).
  - Its own checks are prepared (`docs/proposals/wall-shapes-v2-db-parity.sql`, rehearsed and rolled back: 19 / 19 cases agree, contract unchanged). **Not applied: awaits Mazen's authorisation.**
- **Product Memory:** with Mazen's approval in this task, the other agent's REV-0014 got a mechanical validity fix (full checkpoint SHA; title matching its INDEX row) in `885013b`. It had blocked `npm test` and therefore the deployment.
- **Validation:**
  - 2013 tests;
  - the editor walk-through 33 / 33;
  - all 38 shapes and freeform samples painted at 640 / 375;
  - phone / tablet pixel-identical;
  - other Properties identical.

**Truth: UPDATED.** New capability `wall-shapes-v2`, PENDING_ACCEPTANCE:
- limits: `libraryShapes` 38, `maxFreeformPoints` 100, `minLockAspect` 0.05, `maxLockAspect` 20;
- four contracts; checkpoint `da7dd1c`; `updated` 2026-10-19.

Product Memory: no new record. **STOP for Mazen's visual and functional acceptance.**

## 91. Shapes V2 library category accordions (2026-10-19)

Mazen's task "GAMID — Shapes V2 Left Panel Accordion Fix": the desktop shape library's six categories are accordions in the font-library style. Basic is open, the others closed; several may be open, kept for the session. A collapsed category marks the selected shape, and Freeform stays on top.

- **Product:** `bb50aef267a38cf6cb799e243a435133828bf851`, TESTING run `39196387512`, served files exact. Details: `docs/WALL-EDITOR-SHAPES-V2.md` ("Category accordions").
- **Validation:**
  - accordion checks 36 / 36 (1440 and 1280);
  - Shapes walk-through 33 / 33;
  - phone / tablet unchanged;
  - 2014 tests.

**Truth: NO CHANGE REQUIRED.** A visual refinement; `wall-shapes-v2` (PENDING_ACCEPTANCE) and its contracts are unchanged and still true.

Product Memory: no record. **STOP for Mazen's visual acceptance.**

## 92. Desktop Background panel redesign (2026-10-19)

Mazen's task "GAMID — MY WALL DESKTOP BACKGROUND REDESIGN": organisation and look only, desktop only. Details: `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (Background panel).

- **Product:** `c59a9228019e9724f3adc357e3f94fa69e8dee10`, TESTING run `39199875542`, served files exact.
- **What changed:**
  - Images / Videos uploads are accordion sections with counts (Images open, Videos closed, kept for the session; the chosen type opens its own).
  - Picture and video settings are in Fit & Position and Appearance.
  - Upload cards are equal, with Use / Delete in one row and an in-use badge; the type buttons form one even grid.
  - The right panel is unchanged (background settings are left-panel only by design).
- **Validation:**
  - 2017 tests;
  - Background checks 43 / 43, including every state with the same controls and phone / tablet pixel-identical;
  - 59-state grid with only the desktop Background states changed;
  - transcript identical.
- **Lab:** its fake client got opt-in fixture uploads (`lab.html?assets=1`, outside the repository).

**Truth: NO CHANGE REQUIRED.** No capability, limit or contract changed.

Product Memory: no record. **STOP for Mazen's visual acceptance.**

## 93. Classic → My Wall data import audit (2026-10-19, audit only)

Mazen's task "GAMID — CLASSIC → MY WALL COMPLETE DATA IMPORT AUDIT": audit and design only. No code, schema, deployment, Truth or Product Memory change. Report: `docs/CLASSIC-WALL-IMPORT-AUDIT.md`.

- **Findings:**
  - A published Wall replaces Classic for visitors (`public.js:425`).
  - Wall data elements already bind live, privacy-safe, to the anonymous public view.
  - Of 19 Classic sections, 7 are fully supported on the Wall, 2 partially and 10 missing, among them Favorite Games and all of About Me.
  - Roles / Games / Connections are offered twice (block + data).
  - The block and field lists are hard-coded in JavaScript and in the database validator, so every new section has needed a migration.
- **Proposal:** extend the existing `public.public_section_catalog` (already described as the section registry), with one gated anonymous projection, a generic data-driven `section` binding and generic renderers, while keeping specialised renderers where behaviour is needed.
  - Phases: 1 = UI, 2 = missing fields, 3 = registry, 4 = live socials + Banner.
  - Seven decisions are listed for Mazen.

**Truth: NO CHANGE REQUIRED** (no current fact is contradicted). Product Memory: no record. **STOP for Mazen's review.**

## 94. My Gamer Data, Phase 1 (2026-10-19)

Mazen's task "GAMID — MY GAMER DATA — PHASE 1 IMPLEMENTATION": desktop only. Details: `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (My Gamer Data) and `docs/CLASSIC-WALL-IMPORT-AUDIT.md` §10.

- **Product:** `e1a43c22d06526e498cdb67326ce90733d83b2db`, TESTING run `39203875352`, served files exact.
- **What changed:**
  - The GamID tool is **My Gamer Data**, with the panel heading **Import from Classic**.
  - Six independent accordion sections: Profile (open), Gaming Roles, My Games, Connections, My Duo, My Crews.
  - Each import choice is listed once, so the Roles / Games / Connections block-and-data duplicates are merged; "All …" is the GamID block.
  - Count and "Not on your GamID yet" tags; the card that made the selection is marked.
  - **Refresh from Classic** reads the data again, one read at a time, keeps the current data while loading and on failure, and gives feedback.
- **Validation:**
  - 2024 tests;
  - 43 / 43 lab browser checks;
  - phone / tablet pixel-identical;
  - Background regression unchanged (its known 768 video-frame noise only).
- **Lab:** its fake client got an opt-in synthetic GamID (`lab.html?gamid=1`, outside the repository).

**Truth: NO CHANGE REQUIRED.** No capability, limit or contract changed; the same imports and data.

Product Memory: no record. **STOP for Mazen's visual and functional acceptance.**

## 95. My Gamer Data, Phase 2: import foundation (2026-10-19, database approval gate)

Mazen's task "GAMID — MY GAMER DATA — PHASE 2". Details are in `docs/MY-GAMER-DATA-PHASE2.md`.

- **State:**
  - The code is committed on the feature branch.
  - It is **not deployed**. TESTING still serves `e1a43c2`.
  - The two migrations are **PROPOSED, not applied**: `20261019120000_gamer_data_sections.sql` and `20261019120100_wall_gamer_data_binding.sql`.
- **Architecture:**
  - `public.public_section_catalog` is extended (Wall metadata plus `visibility_switch`, so the owner's switch list is unchanged).
  - There is one projection branch per section, built only from Classic's existing gated reads: `get_public_gamer_data` (anon) and `get_my_gamer_data` (owner).
  - The `gamidData` field `section` is checked by format only, because the CHECK constraints call the validator.
  - A generic painter and automatic discovery in the My Gamer Data library.
- **First sections:**
  - About Me: the card, Location, Member Since, Languages, Favorite Genres.
  - Favorite Games: one (by `game_key`) or all, in Classic's order, behind the My Games gate.
- **Validation:**
  - 2037 tests;
  - PGlite projection tests (6);
  - a rolled-back TESTING rehearsal with the real functions: 23 / 23, every existing Wall still valid, TESTING verified unchanged afterwards;
  - corpus parity: 643 / 643;
  - lab browser checks: Phase 2 34 / 34, Phase 1 regression all pass;
  - phone and tablet pixel-identical; Shapes, Icon Group and Text regressions pass; the grid has 59 states, all unchanged.
- **Found:** `tests/integration/wall-w2-db.sql` has 5 stale steps (storage RLS counts, font references) that fail identically without these migrations. This is proposed as a Product Memory issue.

**Truth: NO CHANGE REQUIRED** (nothing applied or deployed; Truth is updated when the migration and frontend reach TESTING). Product Memory: PROPOSED (not saved). **STOP at the database approval gate.**

## 96. My Gamer Data Phase 2: applied and deployed (2026-10-19, PENDING acceptance)

Mazen authorized passing the database gate. Details: `docs/MY-GAMER-DATA-PHASE2.md` §9.

- **Migrations:** `20261019120000` and `20261019120100` APPLIED on TESTING (one transaction, then `migration repair`).
- **Deployment:** product `fe77637` (Phase 2 code `12c8b3b` plus the registry-step update of `tests/integration/public-section-visibility-db.sql`), run `39254434384`, served files exact.
- **Validation:**
  - 2037 tests, lint and typecheck;
  - live database: My Gamer Data 23 / 23, publishing 42 / 42, validator parity 643 / 643;
  - live anonymous projection = Classic's reads for @black and @zshot;
  - owner projection for GM-TEST-01;
  - @zshot's published Wall unchanged.
- **Pre-existing failures, reported and not fixed:**
  - `wall-w2-db.sql`: 3 of the 5 known steps fail on this run.
  - `public-section-visibility-db.sql`: the leak step false positive ("Game Studio Founder" matches `FOUND`).
- **Mazen's manual review** (desktop Chrome at 1440 and 1280, signed in to his own TESTING account):
  1. Open https://gamid-testing-static.gamid.workers.dev/account/, set About Me (Location, Languages, Genres, with one switch off) and choose 2–4 Favorite Games; save.
  2. Open https://gamid-testing-static.gamid.workers.dev/wall-editor/, then My Gamer Data. Expect the sections Profile, Gaming Roles, About Me, Favorite Games, My Games, Connections, My Duo, My Crews.
  3. About Me: add the About Me Card and each fact. The fact whose switch is off shows PRIVATE.
  4. Favorite Games: add All Favorite Games and One Favorite Game (pick the second).
  5. In another tab, reorder, add or remove a favorite and change an About Me switch. Back in the editor, Refresh from Classic: the elements update in place; a removed single favorite says it is no longer there.
  6. Save, reload, Preview (no PRIVATE, private facts absent). Publish only if wanted, then open `/@<handle>` signed out to see the visitor view.
  7. Check that existing Wall elements and the phone editor are unchanged.

**Truth: UPDATED**: new capability `my-gamer-data` (PENDING_ACCEPTANCE, checkpoint `fe77637`, contracts gamer-data-library / -section-catalog / -privacy / -binding / -first-sections). Product Memory: PROPOSED (not saved). **STOP for Mazen's review; deployment is not acceptance.**

## 97. Favorite Games Display Style (2026-10-19): implemented, migrations PROPOSED, NOT deployed

Mazen's task "GAMID — FAVORITE GAMES DISPLAY STYLE". Details: `docs/MY-GAMER-DATA-PHASE2.md` §10.

- **What it adds:** Display Style (Names Only | Game Covers) per Favorite Games element, reusing Classic's artwork function and `applyGameArtwork`.
- **Blocker 1, database:** the server validator refuses the new `display` key, so two migrations are required: `20261019140000_gamer_data_artwork` and `20261019140100_wall_gamer_data_display`. They are **not applied** and await Mazen's authorization (rehearsed rolled back: 25 / 25, parity 649 / 649).
- **Decision 2, editor CSP:** the editor CSP blocks provider images (a pinned guard), so the editor shows the initials fallback while visitors see covers. Options: (a) allow `cdn2.steamgriddb.com` in the editor, (b) keep it, (c) proxy.
- **Not deployed:** TESTING still serves `fe77637`.

**Truth: NO CHANGE REQUIRED** (nothing applied or deployed; on deployment, `my-gamer-data` gains a Display Style contract). Product Memory: no record. **STOP for Mazen's authorization.**

## 98. Favorite Games Display Style: applied and deployed (2026-10-19, PENDING acceptance)

Mazen authorized both migrations and editor CSP option A. Details: `docs/MY-GAMER-DATA-PHASE2.md` §10–§11.

- **Migrations:** `20261019140000` and `20261019140100` APPLIED on TESTING (one transaction plus `migration repair`).
- **Product:** `e686d7f` (Display Style `078222d`, the CSP change `a061f27`, the name-fit fix `e686d7f`); runs `39261023816` and `39261690232`; served files exact.
- **Validation:**
  - 2043 tests, lint and typecheck;
  - live database: 25 / 25, 42 / 42, parity 649 / 649;
  - lab 24 / 24, Phase 2 34 / 34; the 59-state grid unchanged; Shapes and Icon Group pass;
  - real TESTING editor page: Classic's covers load under the CSP, a non-approved host is blocked, names fit;
  - @zshot's Wall unchanged.
- **Mazen's manual review** (desktop Chrome at 1440 and 1280, signed in to his own TESTING account, with 2–4 Favorite Games chosen in https://gamid-testing-static.gamid.workers.dev/account/):
  1. Open https://gamid-testing-static.gamid.workers.dev/wall-editor/, then My Gamer Data → Favorite Games. Add All Favorite Games and One Favorite Game. Both show as names (Names Only, unchanged).
  2. Select each element: Properties shows Display Style. Choose Game Covers: Classic's covers appear with their names, and the element keeps its place, size and look. Switch back and forth.
  3. Resize an element: the cards re-fit without overflow; long names stay readable.
  4. Save and reload: each element keeps its own style. Open Preview: the same covers.
  5. In Account, reorder or change a favorite. Back in the editor, Refresh from Classic: the covers follow, and the style is kept.
  6. Publish if wanted, then open `/@<handle>` signed out: the same covers. With My Games set to private, the Favorite Games elements show nothing.
  7. A favorite without artwork shows its initials and name.
  8. On the phone, the editor is unchanged (Display Style is desktop-only); the visitor Wall shows the covers.

**Truth: UPDATED**: `my-gamer-data` gains contract `gamer-data-display-style`; `gamer-data-first-sections` no longer says "text cards (no artwork)"; checkpoint `e686d7f`; still PENDING_ACCEPTANCE. Product Memory: no record. **STOP for Mazen's final acceptance.**

## 99. Wall editor Stages bar + append-only Add stage (2026-10-20, PENDING acceptance)

Mazen's task "GAMID — MY WALL EDITOR — GLOBAL STAGES BAR + APPEND-ONLY STAGE CREATION". Details: `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (Stages bar).

- **Product:** `60ca21c`, deployed `2430282` (run `39382427651`), served files exact.
  - Before deploying, Mazen approved a mechanical validation fix of REV-0017, the record another agent pushed after his Favorite Games acceptance. The fix uses the full checkpoint SHA, repository sources, and a History of IN_PROGRESS → COMPLETED in date order; the content is unchanged.
- **Bug fixed:** the editor called `ops.addStage(doc, { afterIndex: <open stage> })`, which inserted the new stage after the open one. It now always appends at the end and keeps the open stage open.
- **Validation:**
  - 2047 tests;
  - lab 40 / 40;
  - @zshot's real 3-stage Wall 16 / 16;
  - header and tool sheets pixel-identical on phone and tablet.
- **Pre-existing failures:** none in the automated suite once REV-0017 was fixed.
- **Mazen's manual review** (signed in, on desktop and on a phone, with a Wall that has 2 or more stages):
  1. Open https://gamid-testing-static.gamid.workers.dev/wall-editor/. The Stages bar is under the header; switch through every tool and confirm the bar stays.
  2. Open Stage 1, then + Add stage. The new stage appears last, the others keep their order and content, and Stage 1 stays open. Repeat from a middle stage and from the last stage.
  3. Use Stage earlier / later; delete the new stage (the confirmation appears); Undo / Redo.
  4. Select an element, then Properties → Move to stage → another stage.
  5. Save, reload, Preview; publish if wanted and check `/@<handle>`.
  6. On the phone, swipe the strip with many stages; + and the stage actions stay reachable; nothing covers the canvas.

**Truth: UPDATED** with new capability `wall-editor-stages-bar` (PENDING_ACCEPTANCE; contracts stages-bar-global, stages-add-appends). Product Memory: REV-0017 validation fix (approved); no new record. **STOP for Mazen's acceptance.**

## 100. Wall editor theme consistency pass (2026-10-20, PENDING visual acceptance)

Mazen's task "GAMID — MY WALL EDITOR — FINAL THEME CONSISTENCY PASS". Details: `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (Theme consistency pass).

- **Product:** `39ed7a7`, deployed `b2352fe` (run `39412009748`), served files exact.
- **Product Memory:** before deploying, Mazen approved the mechanical fix of REV-0018 (the full checkpoint SHA; nothing else).
- **Changed areas (desktop only, presentation only):**
  - Layers;
  - Assets;
  - Templates (Apply to selector, review and confirmation);
  - Properties' Move to stage select and button, and checkboxes (also in Background);
  - the Stages bar's delete confirmation;
  - new line icons lock / unlock / check.
- **Not changed:**
  - behaviour, data and contracts;
  - phone and tablet;
  - the canvas and Wall rendering;
  - the already-themed panels (Add, Text, Media & Links, Shapes, Background, My Gamer Data, the Properties accordions).
- **Other agents:** no other agent's Layers work existed in the repository (nothing to preserve).
- **Validation:** see the doc. **Pre-existing:** Background 768 video-frame noise only.
- **Mazen's visual review** (desktop Chrome at 1440 and 1280, signed in, https://gamid-testing-static.gamid.workers.dev/wall-editor/):
  1. Layout: select a layer, hover others, use the forward / backward arrows, lock and unlock an artwork.
  2. Assets: upload cards, the IN USE badge, Add and Delete.
  3. Templates: open Apply to (mouse and keyboard), Review replacement, Cancel and Replace.
  4. Properties: Move to stage, and the Gradient / Border checkboxes of a shape.
  5. Stages bar: Delete stage confirmation.
  6. A phone check: nothing should look different there.

**Truth: NO CHANGE REQUIRED** (presentation only; no capability or contract changed). Product Memory: REV-0018 mechanical fix (approved); no new record. **STOP for Mazen's visual acceptance.**

## 101. Mobile Wall Editor V2 (2026-10-20, PENDING Mazen's acceptance)

Mazen's task "GAMID — MOBILE WALL EDITOR V2 — Complete Mobile-First Redesign, Implementation & TESTING Deployment". Details: `docs/WALL-EDITOR-MOBILE-V2.md`.

- **Product:** `81c06ba` (`81c06bab1919ebe5a4e99b9f7146ad3751d52d34`), deployed `22cbc85` (`22cbc85b86b8f2eddf4cfb0c1a077e5f59c75b5e`, run `39440094448`, full project validation in the workflow passed). Served `mobile-shell.js`, `phone.js`, `editor-mobile.css`, `canvas.js`, `controls.js`, `editor.js`, `editor.css` and `editor-desktop.css` are byte-identical (SHA-256) to the commit; the signed-out live page boots at 390 and 1440 with the sign-in gate.
- **Scope: phones only.**
  - The phone query is in `dist/wall-editor/phone.js`: below 600px wide, or below 900px when at most 500px tall.
  - Tablets (600–899px, taller than 500px) and desktops keep their editors.
  - The Classic Editor and Visitor and the Wall Visitor (desktop and mobile) are untouched: no file outside `dist/wall-editor/` changed.
- **What it is:** a new phone shell (`mobile-shell.js`, `editor-mobile.css`) over the same Wall engine.
  - Compact top toolbar: Save = save status; Preview; Wall menu with the separate Publish.
  - The accepted global Stages bar is kept on phones.
  - View-only canvas zoom, pan and Fit.
  - Selection quick actions.
  - Bottom toolbar: Add, Layers, Stages, Assets, More, with half / full sheets (side sheets in landscape).
  - Keyboard-aware sheets.
  - Phone Properties: Living Fire; collapsible Position & size with nudge; Arrange & align.
  - The shape library on phones (no Freeform pen).
- **Not changed:** the document format, ops, save / load, validation, permissions, assets and limits, renderer, Preview, publishing.
- **Truth:**
  - new `wall-editor-mobile-v2` PENDING_ACCEPTANCE;
  - phone clauses of the ACCEPTED `wall-shapes-v2` / `shapes-v2-library` and `living-fire-text` / `living-fire-editor` repointed to it (statuses unchanged);
  - `wall-editor-stages-bar` preserved as is.
- **Not offered (not in the model):** stage names, layer show / hide, Living Ice. Freeform pen / Edit Points stay desktop-only.
- **Limitations:**
  - a phone 900px or wider in landscape (e.g. 932×430) gets the desktop layout;
  - iOS Safari and physical devices are not tested: browser emulation plus the Android Emulator only.
- **Validation** (details in the doc):
  - E2E touch workflow: 71 checks × 6 phone sizes, ALL PASS.
  - Android Emulator: render, Add > Text, real software keyboard.
  - Desktop / tablet non-regression: 8 sizes × 11 states style-identical; tablets pixel-identical.
  - `npm test`: 2055 tests, 2054 pass, 0 fail, 1 skipped.
  - typecheck, lint and build: pass.
- **Mazen's review** (TESTING, signed in, on a phone or the Android Emulator: https://gamid-testing-static.gamid.workers.dev/wall-editor/):
  1. Open the Wall; switch stages (Stages bar, stage indicator, Stages sheet).
  2. Add > Text; edit the text and font; Living Fire under Edit > Text effects.
  3. Move with a finger; resize with a handle; nudge under Position & size.
  4. Add a picture from Assets and adjust it; add a library shape.
  5. In Layers: reorder; lock / unlock; duplicate / delete; move to stage.
  6. Background; a template with its confirmation; Undo / Redo.
  7. Pinch to zoom, pan, Fit; check that nothing in the Wall changes.
  8. Save; reload; Preview and back.
  9. Check that Publish happens only from the Wall menu.
  10. Open the same Wall on desktop.

**Truth: UPDATED** (`wall-editor-mobile-v2` PENDING_ACCEPTANCE; two phone clauses repointed). Product Memory: no record (none proposed for saving without Mazen's approval). **STOP for Mazen's manual acceptance.**


## 102. Public Wall bandwidth baseline (2026-10-21, measurement only)

Mazen's task "GAMID — FULL WALL BANDWIDTH BASELINE AUDIT". Report and the repeatable protocol: `docs/WALL-BANDWIDTH-BASELINE.md`; tools: `scripts/wall-bandwidth/`.

- **Method:** the deployed TESTING visitor page `@black` (stamp `22cbc85`), read anonymously; Playwright + Chrome 155 with CDP network events.
  - Desktop 1440×900 and Pixel 7 emulation; one throttled mobile session.
  - Every key scenario ran 3× per profile, with results identical within 0.01 MB.
- **Baseline:**

| Measure | Desktop | Mobile |
|---|---:|---:|
| Initial Wall load, before any interaction | 19.06 MB | 28.5–28.8 MB (stage 2 is on screen at reveal) |
| All stages | 41.46 MB | 41.46 MB |
| Full playback / replay / pause / seek | 0 MB | 0 MB (files fully buffered on first view, also throttled) |
| Warm reload | 2.28 MB (the Intro again) | 2.28 MB |
| Second visit in a new tab | 32.30 MB (every Wall video again: new signed URLs miss the browser and CDN caches) | 32.30 MB |
| Complete session | 76.04 MB | 76.04 MB |

  - Video is 77.7% of a cold view and 87.6% of a session.
- **Largest problems:**
  1. repeat-visit video re-downloads;
  2. 30 MB of video per cold view;
  3. the Intro re-downloaded on every load;
  4. pictures of every stage loaded up front (incl. 2.01 MB for stage 3);
  5. 3.56 MB of third-party covers.
- **Not measured:** Supabase billed Egress / Cached Egress (dashboard only; the browser bytes are split by `cf-cache-status` instead); physical devices; iOS Safari.
- **Nothing changed:** no product, database, storage, cache or deployment change. Mobile Wall Editor V2 is untouched and still PENDING.

**Truth: NO CHANGE REQUIRED** (measurement findings are not product truth). **STOP: F6–F8 wait for Mazen's approval.**

## 103. F6–F8 bandwidth optimization plan (2026-10-21, research and planning only)

Mazen's task "GAMID — F6–F8 Engineering Research & Optimization Plan". The proposal: `docs/WALL-BANDWIDTH-F6-F8-PLAN.md`. **Nothing implemented, deployed or accepted.**

- **New evidence** (TESTING, anonymous, read-only):
  1. **Simulated cross-tab lease reuse** (`harness.mjs --plan revisit --simulate-shared-leases`): the new-tab revisit drops from 32.28 to 15.70 MB. The rest is the Intro plus two moov-at-end MP4s that Chrome cannot serve from its cache (`ERR_CACHE_OPERATION_NOT_SUPPORTED`); every faststart file costs 0 bytes.
  2. **Supabase rejects `apikey` as a query parameter** (HTTP 400), so a token-free `<video>` URL needs a lease or a same-origin proxy.
  3. **Encoding experiments** on this Wall's files at matched quality (VMAF / SSIM): lossless WebP −17% / −28%, lossy pictures −65 to −88%, a muted video carries a 128 kbit/s audio track (−8.3%), alpha WebM −30% at VMAF 97.9; the AV1 gate fails for a cover-cropped background at CRF 32.
- **Recommended order:**
  1. **F8-A:** lossless faststart + audio-strip playback copies via the existing `wall_video_jobs` worker queue;
  2. **F6-A:** cross-tab lease reuse (client only; *estimated* revisit 32.3 → about 2.3 MB);
  3. **F6-B:** the Intro through the existing `/@handle/intro.webm` route with `private, no-cache` revalidation;
  4. **F7-A** stage-aware pictures + **F7-C** WebP covers;
  5. **F7-B** lossless picture derivatives;
  6. **F8-B** (optional) quality-gated renditions.
- **Rejected:** a server-shared lease, public / immutable buckets, the query-parameter key, HLS / DASH.
- **Decisions for Mazen:**
  - the F5 contract change (F6-B);
  - the Cloudflare terms for video through a free-plan Worker;
  - derivative storage and quota;
  - lossy quality thresholds.

**Truth: NO CHANGE REQUIRED** (research only). **STOP: no optimization starts without Mazen's explicit approval.**

## 104. F6-A cross-tab Wall video URL reuse + Product Memory sync (2026-10-21, PENDING Mazen's acceptance)

Mazen's task "GAMID — AUTHORIZED F8-A + F6-A IMPLEMENTATION AND PRODUCT MEMORY SYNC". Details: `docs/WALL-VIDEO-URL-REUSE-F6A.md`.

- **Product Memory sync:**
  - REV-0021 (saved by ChatGPT on `feature/product-memory-wall-bandwidth-baseline`, `19dc0f2`) was cherry-picked here as `2f4e5e7` + `41e60aa`;
  - the mechanical full-SHA fix approved by Mazen is `662271a`;
  - 46 records validate.
- **F6-A:**
  - product `ca2d6f1`, with fixes `a788607` and `5d599b4`, both found by the live security validation;
  - deployed: final head `8ebacef` (run `39475915468`), earlier `a142afe` (`39465524147`) and `104e393` (`39472709013`);
  - the four changed files are served byte-identical.
  - Published-Wall video leases are reused across tabs and restarts of one browser:
    - scoped to Wall + publication + asset + object;
    - forgotten when the fresh manifest drops them or the Wall / GamID is no longer public;
    - cleared on sign-out;
    - lifetimes unchanged (6 h server lease, 30 min margin).
- **Measured** (deployed TESTING, @black):
  - new-tab revisit 32.30 → **2.28 MB** on desktop (3 runs) and 2.28 / 8.13 MB on mobile (2 runs);
  - browser-restart revisit 2.29 MB;
  - complete session 76.04 → **46.02 MB** (−39.5%);
  - 0 video leases on a revisit;
  - the intermittent mobile residual is the moov-at-end MP4 (F8-A's target).
- **Security:** 15 live scenarios pass (`scripts/wall-bandwidth/f6a-security.mjs`); unit tests 10 + 7.
- **F8-A paused by Mazen's decision.** Two blockers:
  - a playback copy would double-count in Global Usage, which counts every object under `<uid>/`, so it needs a storage contract;
  - a worker redeploy needs Google Cloud access that this machine lacks.
- **Not started:** F6-B, F7, F8-B.

**Truth: UPDATED** (new `wall-video-url-reuse` PENDING_ACCEPTANCE at `5d599b4`). Product Memory: REV-0021 synced; a DEC proposal (F8-A paused) awaits Mazen. **STOP for Mazen's manual acceptance.**

## 105. F7-A stage-aware Wall pictures + F7-C same-art cover thumbnails; phase-2 resource audit (2026-10-21, PENDING Mazen's final acceptance)

Mazen's task "Continue GamID Wall bandwidth optimization on TESTING only". It included his mid-task clarification:
- audit **every** Public Wall and Intro resource;
- any optimization that changes visual quality, storage accounting, an approved contract or infrastructure waits for his approval;
- comprehensive acceptance testing waits for the final phase.

Details: `docs/WALL-PICTURES-COVERS-F7.md` (implementation) and `docs/WALL-BANDWIDTH-PHASE2-RESEARCH.md` (audit + decisions).

- **F7-C design choice:** Mazen chose the provider's same-art thumbnail via `srcset` over the WebP filter, because the filter could pick different artwork.
- **Product:** `97b3fdc5dc6e4725debf8a21154d82210499851e`, deployed (run `39486918858`); the served changed files are byte-identical to the commit.
  - **F7-A:** on the visitor page only, pictures used only by stages 2+ are read when their stage comes within one viewport.
    - Stage 1 and the whole-Wall background still load with the Intro.
    - Frames are filled in place, with no repaint.
    - Unchanged: the read, the RLS check, the manifest rule, F3 gating, and the editor / Preview.
  - **F7-C:** Favorite Games covers offer `thumb/<hash>.jpg` (267 px, the same artwork) beside the 600 px grid.
    - The browser chooses by displayed width × DPR.
    - A failing thumbnail falls back to the full image once.
- **Measured live (@black; not the final benchmark):**
  - desktop DPR 1: covers 3.56 → 0.30 MB, and the stage-3 GIF (2.01 MB) is deferred until stage 3 is near;
  - DPR 2 keeps the full covers;
  - on mobile, stage 3 is within the margin at reveal, so nothing is deferred on this short Wall;
  - no page errors; all split pieces drawn.
- **Tests:**
  - new: 5 F7-A + 4 F7-C;
  - full suite: 2074 tests, 2073 pass, 0 fail, 1 skipped;
  - lint and typecheck pass;
  - F6-A live security regression after F7 (`scripts/wall-bandwidth/f6a-security.mjs`): see the completion report of this task.
- **Audit:** every resource, with bytes, caching and an opportunity, in research §1.
  - Fire effects and text effects are procedural: about 12 KB of JS, no media.
  - The remaining large items are all media decisions.
- **Pending decisions (research only, not implemented):**
  - **F8-A:** recommended option A, a lossless in-place faststart remux.
    - Stream hashes are verified before the original is replaced; audio is kept.
    - It needs Mazen's OK because the file bytes change.
    - Deploying it needs Google Cloud access.
  - **F6-B:** Cloudflare's CDN terms restrict video not hosted on Cloudflare (Stream / Images / R2), so the planned Worker proxy is not recommended.
    - The terms-clean route is an R2-hosted Intro, a separate infrastructure decision.
    - The existing crawler `intro.webm` route should be reviewed against the same terms.
- **Waiting for approval:** F7-B, F8-B, avatar display copies and JS bundling / immutable URLs.

**Truth: NO CHANGE REQUIRED** (delivery optimizations only). Product Memory: no writes; the earlier DEC proposal (F8-A paused) still awaits Mazen. **STOP for Mazen's decisions.**

## 106. F8-A fast-start MP4 Wall video uploads, lossless (2026-10-21, PENDING Mazen's acceptance)

Mazen's task "GAMID — SAFE WALL + INTRO BANDWIDTH OPTIMIZATION" authorized the single-copy lossless faststart direction (research §2, option A). Details: `docs/WALL-VIDEO-FASTSTART-F8A.md`.

- **Product:** `51e397259ec6487c4fe5cb63597e40d8399cedf8`; Truth `5600d06`.
  - Deployed head `5600d0677c5f68a4b9a81c418d644173dfeaf662` (run `39492020998`); the served changed files are byte-identical to the commit.
  - New MP4 uploads whose `moov` follows the media are remuxed in the owner's browser, in `uploadWallVideo` (desktop + mobile editors).
  - The `moov` moves before the first `mdat`, and only the stco / co64 entries shift. Streams, audio, metadata and size are unchanged.
  - The candidate is verified from its own bytes, and only the verified bytes are uploaded.
  - Already-fast-start MP4s, WebMs and every unprovable file are uploaded unchanged. The server checks, the quota and existing files are unchanged.
- **Checks:**
  - 5 new unit tests (including 300 fuzz rounds);
  - full suite: 2079 tests, 2078 pass, 0 fail, 1 skipped; lint and typecheck pass;
  - 10 real / fixture files: `ffmpeg -f streamhash` identical, ffprobe identical, server `inspectMp4` verdict identical, Chrome output = Node output, playback and seek OK;
  - the deployed module produces the same bytes on the TESTING origin.
- **Measured (local Chrome):**
  - first frame about 35–45% sooner, requests 3 → 1;
  - first-view bytes unchanged;
  - the revisit saving (the Chrome media-cache failure on moov-at-end files) is still an estimate for the final TESTING benchmark.
- **Existing files:**
  - not rewritten;
  - a migration plan (new path + compare-and-set switch of `wall_assets.storage_path` + delayed old-object deletion) awaits Mazen's separate approval, with decisions on the temporary double count, the runner and owner notice.
- **No other audit item** qualified as low-risk and within contract; all remaining items wait for approval (doc, last section).
- **Unchanged:** Google Cloud, R2, F6-B, F7-B and F8-B (none changed or implemented).

**Truth: UPDATED** (new `wall-video-faststart` PENDING_ACCEPTANCE at `51e3972`). Product Memory: no writes; the earlier DEC proposal (F8-A paused) is superseded by Mazen's authorization and should not be saved as written. **STOP for Mazen's acceptance and the migration decision.**

## 107. F1–F8 final bandwidth and performance benchmark (2026-10-21, measurement only, PENDING Mazen's review)

Mazen's task "GAMID — F1–F8 FINAL BANDWIDTH & PERFORMANCE BENCHMARK", run after his F8-A manual smoke test (a new MP4 uploaded, published and played on the visitor Wall). Details and raw evidence: `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md`.

- **Run:** on TESTING `5600d06` with the baseline's own protocol and harness (5 runs, @black, anonymous). Nothing was deployed or changed.
- **Content changes since the baseline:**
  - the new 4K MP4 on stage 3 (50.55 MB, hash `feef7322ef`), counted separately;
  - a replaced Intro: 1920×1080, 11.04 s, 6.97 MB, within F2; Intro bytes and reveal timings are non-comparable.
- **Comparable results** (excl. Intro and the new MP4):
  - new-tab visit 30.10 → 0.08 MB (F6-A);
  - cold first visit −5.26 MB desktop / about −3.1 MB mobile (F7-C covers −3.26; F7-A GIF −2.01 on desktop);
  - all three stages −3.2 to −3.4 MB;
  - same-tab reload unchanged (0.08 MB);
  - Wall video per complete session 60.00 → 30.00 MB;
  - Supabase bytes excl. Intro 65.34 → 35.33 MB per desktop session.
  - Full profile now: 92.77 MB for a cold view of all stages.
- **F8-A:**
  - the new video is verified fast start (anonymous lease, box headers);
  - whether the remux or the source made it so cannot be determined;
  - existing MP4s are not migrated;
  - **the revisit saving is not confirmed**: under throttling, the fast-start 4K file was re-downloaded (49.51 MB) on the new-tab visit, because Chrome's media cache could not serve the large range-filled entry.
- **Regressions:**
  - 15 live security scenarios pass;
  - 0 video / page errors;
  - console errors only the pre-existing `favicon.ico` 404s.
- **Billed Supabase Egress:** not measured (owner's Usage page).

**Truth: NO CHANGE REQUIRED.** Product Memory: a REV proposal awaits Mazen. **STOP for Mazen's review.**

## 108. F6–F8 scoped acceptance, REV-0022, F8-B feasibility study (2026-10-21, documentation and study only)

Mazen's task "GAMID — F6–F8 Acceptance, Product Memory & F8-B Feasibility Study". The reviewed state:
- branch `feature/play-together-notifications` at `d7aad91`;
- TESTING serving `5600d06` = the benchmark checkpoint (no product commit since);
- benchmark docs `cd3180b`.

**Mazen's scoped acceptance decisions:**

| Feature | Decision | Scope |
|---|---|---|
| F6-A | ACCEPTED | cross-tab / restart video URL reuse, with the documented large-file cache limitation |
| F7-A | ACCEPTED | stage-aware picture loading |
| F7-C | ACCEPTED | same-art cover thumbnails |
| F8-A | FUNCTIONALLY ACCEPTED | fast start for new MP4 uploads only. Correctness and playback accepted; local first-frame gain measured but not a guarantee; repeat-visit bandwidth reduction NOT PROVEN; existing-MP4 migration NOT APPROVED |

**The F1–F8 program is not complete.** Still open: F6-B, F7-B, F8-B and the existing-MP4 migration.

**Truth: UPDATED.**
- `wall-video-url-reuse` → ACCEPTED, with a scope note on the limitation.
- `wall-video-faststart` → ACCEPTED, with a note that the acceptance is functional only.
- New ACCEPTED capabilities at `97b3fdc`: `wall-picture-stage-loading` (F7-A) and `game-cover-thumbnails` (F7-C).

**Product Memory:** REV-0022 "F1–F8 Final Bandwidth Benchmark" saved with Mazen's approval, and the Register and counter updated.
- **Blocker:** the full validation fails only because of **IDEA-0003**, pushed by another agent in `ae5c64b` / `d7aad91`: missing sections, the save_approval format, a title mismatch and the IDEA counter. It was not touched here.
- REV-0022 validates in an isolated check: 47 records pass once IDEA-0003 is set aside.

**F8-B:** a feasibility study only, in `docs/WALL-VIDEO-RENDITIONS-F8B-STUDY.md`. It uses local isolated copies and a synthetic clip; no TESTING media, upload policy, database, storage or quota changed. Nothing was implemented or deployed.

**STOP for Mazen's separate implementation authorization.**

## 109. F8-B1 conditional internal visitor renditions (2026-10-21, implemented on a branch; NOT deployed)

Mazen's task "GAMID — F8-B1 CONDITIONAL VIDEO RENDITIONS". Details, deployment needs and the acceptance plan: `docs/WALL-VIDEO-RENDITIONS-F8B1.md`.

- **Where:**
  - branch `feature/f8b1-video-renditions`, from `0975104`;
  - TESTING unchanged at `5600d06`;
  - migration `20261021120000_video_renditions_f8b1.sql` **prepared, not applied**;
  - no Edge Function, worker, dispatcher or site deployment.
- **Implemented:**
  - the eligibility rule and best-effort queue in `wall-asset-register`;
  - the rendition registry / queue / database gate / manifest / lease / storage-driven sweep / quota exclusion;
  - the worker module (plan, encode, validation, bit-identical audio check, VMAF gate; refuses without libvmaf);
  - the dispatcher's table, and the `public-media` bucket;
  - the visitor page's rendition preference with fallback to the original.
- **Measured locally on isolated copies:**
  - @black's 4K MP4 went from 50.55 to 13.34 MB (−73.6%) at VMAF 99.49 / p5 95.77, audio bit-identical → READY;
  - the 360p clip was rejected by the gate (VMAF 91.97);
  - Chrome at 9 Mbit/s: the rendition plays through (13.3 MB) while the original stalls and drops 46% of frames; the first frame is not faster.
- **Tests:**
  - 20 new tests (13 unit, 6 PGlite, 1 opt-in native that passed locally);
  - full suite: 2099 tests, 2097 pass, 0 fail, 2 skipped;
  - lint and typecheck pass.
- **Blockers for deployment:**
  - the worker image's Debian FFmpeg has **no libvmaf** (bookworm and trixie checked), so it needs an image change;
  - Google Cloud access (image + dispatcher);
  - Mazen's authorization for the migration, Edge Functions and site.

**Truth: NO CHANGE** (un-deployed). **STOP for Mazen's deployment authorization.**

## 110. F8-B1 partial TESTING deployment (2026-10-21, PENDING: the worker is not deployed)

Mazen's task "GAMID — F8-B1 TESTING DEPLOYMENT & REAL-WORLD BENCHMARK", with his choices "partial now, worker later" and "VMAF-only static FFmpeg". Details, rollback and costs: `docs/WALL-VIDEO-RENDITIONS-F8B1.md` §8–§9.

- **Rehearsal:** two rolled-back rehearsals on TESTING, all checks true.
  - **Caught a regression:** the prepared migration would have dropped the live **Custom Fonts** quota line from `get_my_usage_impl`.
  - **Fixed** in `71441be` with in-place patches of the live definitions.
- **Deployed:**
  - migration `20261021120000` applied, history recorded;
  - `wall-asset-register` v13 (was v12) and `public-media` v3 (was v2), JWT settings unchanged;
  - site run `39543363692` from `feature/f8b1-video-renditions`, stamp `764e3b8`, changed files byte-identical.
- **Not deployed:**
  - the worker Job image and dispatcher; this machine has no Google Cloud access;
  - consequence: no rendition can become READY; eligible uploads queue as pending; visitors always get the original.
- **Prepared for that deploy** (`cf425a8`):
  - a pinned, checksum-verified static FFmpeg 8.1.3 with libvmaf used only for VMAF;
  - the `rendition-smoke` command;
  - the Cloud Build allowlist entry (its absence would have failed the build);
  - `worker/cloud-run/deploy-f8b1-testing.sh`.
- **Live regression:**
  - 15/15 security scenarios pass;
  - the comparable benchmark is unchanged;
  - one intermittent stall of the 4K original (1 of 3 runs, not reproducible).
- **Not yet done:** READY, the end-to-end test and the TESTING optimized-delivery benchmark wait for the worker. The local measurements (§3) stand.

**Truth: UPDATED** — `wall-video-renditions` PENDING_ACCEPTANCE at `71441be`, with a note that nothing can be READY until the worker ships. **STOP for Mazen**: worker deployment by someone with Google Cloud access, then the end-to-end test and benchmark, then his manual acceptance.

## 111. F8-B1 worker deployed; TESTING end-to-end validation (2026-10-21, PENDING Mazen's acceptance)

Mazen ran `worker/cloud-run/deploy-f8b1-testing.sh 3bb2871` in Cloud Shell: build SUCCESS, image-only updates verified, `rendition-smoke` ok (VMAF 95.85), `f2-smoke` ok. Then a full end-to-end run on GM-TEST-01 with synthetic media only (details: `docs/WALL-VIDEO-RENDITIONS-F8B1.md` §10–§11).

- **Processing:**
  - 4K PASS clip: READY in 33 s of worker time (50 s from queue), VMAF 96.325 / 95.254, 43.02 → 0.78 MB;
  - sharp 4K clip: rejected QUALITY_GATE (VMAF 94.685);
  - efficient 1080p: never queued (`RENDITION_NOT_ELIGIBLE`);
  - the dispatcher accepted the dispatches (HTTP 202).
- **Visitor:**
  - the page plays the rendition (1920×1080);
  - a refused rendition lease falls back to the 4K original;
  - at 9 Mbit/s the rendition plays the whole clip (0.78 MB), while the original plays 1.5 s of 8 in 30 s (first frame 2.2 vs 0.4 s).
- **Owner, editor, Usage:**
  - the owner's asset list has only originals;
  - Usage counts exactly the originals (81,138,924 B) and excludes the 776,489 B rendition;
  - no slot is created.
- **Revocation, deletion, cleanup:**
  - PRIVATE, Disable and Unpublish → 404 for the rendition and the original; enable and republish restore both;
  - delete detaches the rendition at once;
  - a real worker run's sweep deleted the orphan after the 30-minute grace.
- **Restored:** GM-TEST-01 matches its baseline exactly; 0 rendition rows and objects remain; @black and @zshot untouched.
- **Costs:** observed processing 18–33 s per attempt (about $0.002 estimated; billing not visible). Real-content delivery estimate at 10,000 realistic views: 101 → 27 GB.
- **Remaining:**
  - Mazen's own browser upload (the deployed `wall-asset-register` handler itself);
  - devices, Safari and Firefox.

**Truth: UPDATED** (`wall-video-renditions` note: fully deployed and validated; checkpoint `3bb2871`; still PENDING_ACCEPTANCE). **STOP for Mazen's acceptance.**

## 112. F8-B1 real-upload verification and FINAL ACCEPTANCE (2026-10-21)

**Mazen's real upload.** A 4K color-bar MP4 (about 24 MB) in his Wall Editor on `@black`, stage 3, published. It was investigated read-only (`docs/WALL-VIDEO-RENDITIONS-F8B1.md` §12):
- asset `7f301afd`: 25,148,899 B, 3840×2160, 10 s;
- a rendition job was created by the deployed `wall-asset-register` v13 in the same second as registration;
- **READY** after 55 s on the worker: VMAF 95.239 / 93.710, 3,285,412 B (−86.9%), 1920×1080;
- the anonymous visitor streams the rendition (3.29 MB, 0 dropped), and the refused-lease fallback plays the original (25.16 MB);
- the editor lists the original; Usage counts only the originals (119,919,397 B); 12 of 15 video slots, none taken by the rendition.

**Acceptance.** Mazen explicitly ACCEPTED F8-B1 on TESTING on 2026-10-21: final acceptance of the implemented scope. Further improvements are separate future tasks. The known limitations are listed in the doc's §12.

**Truth: UPDATED** — `wall-video-renditions` ACCEPTED (checkpoint `3bb2871`). Product Memory: DEC-0007 and REV-0023 proposed, not saved. Not merged; TESTING serves `feature/f8b1-video-renditions` (`764e3b8`).
## 113. Universal Delete UX & Reference Cleanup (2026-10-21, implemented on a branch, NOT deployed)

Mazen's task "GAMID — UNIVERSAL DELETE UX & REFERENCE CLEANUP". Branch `feature/universal-delete-ux`, from `1f7d203`. Full record: `docs/UNIVERSAL-DELETE-UX.md`.

**What changed:**
- **One rule** for every Wall asset (image, GIF or video) and custom font, in Assets, the Background panel (desktop and phone) and My Fonts: unused → deleted at once; in use → one modal confirmation; confirm → deleted, with references resolved; cancel → nothing.
- **Server side:** a new additive migration, `20261022100000_universal_delete_resolve.sql`. It provides two owner RPCs that delete the resource and, in ONE transaction, strip it from the saved draft (at the editor's revision) and the published snapshot. On a conflict, an invalid result or an unknown reference place, everything rolls back.
- **Editor:** it follows the server's revision through `session.rebase`. Unsaved edits are kept, and undo and redo are rewritten.

**Validation:**
- tests: 22 new (9 DB on PGlite, 13 editor and client);
- the guard tests that pinned the superseded refusal rule were deliberately updated;
- full suite 2121 tests, 0 failures; lint and typecheck clean;
- the dialog layout was checked at 1280×800, 375×812 and 740×360.

**Exceptions for Mazen:**
- stage delete still always confirms (`stages-bar-global`);
- there is no orphan cleanup for Wall media whose file removal fails after the row is deleted (an existing gap; a design is ready, but it is not built without approval);
- the published Wall changes immediately on a confirmed deletion;
- the old refusing RPCs remain for cached pages.

**Deployment** (separately authorized): apply the migration on TESTING, then deploy the site from the branch. No Edge Function or infrastructure changes.

GamID Truth: NO CHANGE REQUIRED yet. TESTING still runs the refusing behaviour that `custom-font-delete` describes; the replacement text is prepared in the doc's §8 for the deployment task. Product Memory: PROPOSED (DEC-0008, ISS-0015), not saved. Not merged; TESTING unchanged (`764e3b8`).
## 114. Universal Delete UX: orphan cleanup, TESTING deployment and E2E (2026-10-21, PENDING Mazen's acceptance)

Mazen approved the remaining decisions and authorized completion and deployment on TESTING. Full record: `docs/UNIVERSAL-DELETE-UX.md` §5–§10.

**Decisions:**
- Stage deletion keeps its confirmation, including for an empty stage. It is exempt from the immediate-delete rule, and the Stages contract is unchanged.
- The safe orphan cleanup is approved.

**Orphan cleanup** (`54e3b43`; migration `20261022110000_usage_media_orphans.sql`). A step in the owner's existing Usage cleanup route removes Wall image / video files left behind when a deletion's file removal failed:
- detection uses authoritative server state, with a 1 h grace;
- a file is never touched if it is registered, reserved, recently received or owned by a conversion lifecycle;
- tries are bounded: 10 a run, 5 per file, 15 minutes apart, under the usage lock;
- each file is re-checked right before deletion;
- one failure never stops the others.

`authorize_usage_delete` (an asserted in-place patch) now refuses registered Wall asset files. The Wall editor runs the cleanup when it opens. 8 new tests.

**Validation:** full suite 2129 tests, 0 failures (2 pre-existing skips); lint, typecheck, Truth and Product Memory validation clean.

**Deployment** on TESTING `upvtrczefcvigxdyuylw`:
1. both migrations were rehearsed against the live schema inside a rolled-back transaction, then applied and recorded (`migration repair`);
2. `usage-upload` v12 → v13 (`verify_jwt` false; the unauthenticated smoke returns 401);
3. the site from `feature/universal-delete-ux` at `54e3b43`, run `39595702093` (stamp verified; editor modules byte-identical, `session.js` differing only in line endings).

Production was not touched. Nothing was merged.

**E2E on GM-TEST-01** (synthetic files only). All of these were verified at the database level, plus an exact visitor-Wall check:
- unused deletes are immediate;
- in-use deletes are refused without confirmation;
- a stale revision gives a conflict;
- registered files are protected;
- confirmed image, video and font deletes resolve every reference in the draft and the publication, which stay in step;
- the anonymous visitor Wall is valid and exactly equals the editor's transforms;
- the orphan is claimed after the grace period and removed, and Usage goes to 0 B;
- the F8-B1 rendition foreign key is intact.

GM-TEST-01 is restored to its exact baseline.

**Not verified live** (needs Mazen, signed in): the editor UI (dialog, Undo, Stages bar, phone layout) and the cleanup route with a real owner session.

GamID Truth: UPDATED. New `wall-universal-delete` (PENDING_ACCEPTANCE, checkpoint `54e3b43`); the `custom-wall-fonts` `custom-font-delete` contract and checkpoint updated. Product Memory: PROPOSED (DEC-0008, ISS-0015), not saved. TESTING now serves `54e3b43`.
## 115. Universal Delete UX final adjustments: every deletion confirmed + silent UI (2026-10-21, PENDING Mazen's acceptance)

Mazen approved two adjustments. Full record: `docs/UNIVERSAL-DELETE-UX.md` §11.

**1. Every permanent deletion is confirmed.**
- An unused image, GIF, video or font gets a simple confirmation ("not currently in use … cannot be undone", Cancel / Delete <type>) with no usage list. A used one keeps the detailed confirmation.
- Nothing is sent before Delete.
- A deletion confirmed as unused goes to the server with `resolve = false`. If the server finds it still used, nothing is deleted and the same dialog switches to the detailed confirmation.
- Unchanged: the stage confirmation, canvas element removal and its Undo, and all server-side safety (one transaction, conflicts, permissions, draft / published consistency, font fallback, orphan cleanup).
- Files: `delete-flow.js`, and `session.savedDocument` (usage in the saved draft). 18 flow and dialog tests, including a static check that the server is asked only from a confirmation's Delete.

**2. Silent interface.**
- The audit of every shipped file found no application-owned UI sound at all: no audio element, Web Audio, oscillator, sound file, speech, vibration or system notification, and no audio infrastructure. Nothing had to be disabled or removed.
- Every `<video>` GamID creates is muted or never played, except the Intro player, which keeps its audio (verified live, unchanged).
- Third-party players play only when started by the visitor; this is reported, not changed.
- Policy: the Truth contract `silent-ui-policy`, plus `tests/silent-ui-policy.test.js` (3 tests), so a future UI sound cannot ship unreviewed.

**Validation:**
- full suite 2135 tests, 0 failures (2 pre-existing skips); lint, typecheck and Truth validation clean;
- dialog lab checked at 1280×800 and 375×812 (the simple dialog, and the in-place switch).

**Deployment:** site `da4cc5a2f1ad785260309cb6022cdebbba6a6dd1`, run `39616006123`. No migration, no Edge Function change. Stamp verified; deployed modules identical; the unauthenticated `usage-upload` cleanup smoke returns 401.

**Not verified live** (needs Mazen, signed in): the new confirmation and the silence in the live editor.

GamID Truth: UPDATED.
- `wall-universal-delete`: `universal-delete-rule` revised, checkpoint `da4cc5a`.
- `custom-wall-fonts`: `custom-font-delete` revised, checkpoint `da4cc5a`.
- New `silent-ui-policy` (PENDING_ACCEPTANCE).

Product Memory: PROPOSED (DEC-0008 revised, DEC-0009 new, ISS-0015), not saved.
## 116. Background inside Assets + Product Memory validation repair (2026-10-21/22, PENDING Mazen's acceptance)

Mazen's task "GAMID — BACKGROUND INSIDE ASSETS" (TESTING only). Branch `feature/background-inside-assets`, from `52da242`; not merged. Full record: `docs/WALL-BACKGROUND-INSIDE-ASSETS.md`.

**What changed** (product `a623067`):
- Assets is the one tool for uploaded Wall media and the Wall background, with two areas: My Assets and Background.
- The standalone Background tool is gone from the desktop / tablet rail and the phone More sheet. Old "background" openers land on Assets › Background.
- Every Background control, id and behaviour is kept; the accepted desktop styling is the same rules re-scoped to the area.
- My Assets cards offer explicit **Add to Canvas** and **Set as Background** (the same stored file, the Background scope, no copy).
- Background offers Upload image / Upload image or video through the same asset store, one upload at a time, assigned to the intended scope.
- Phone Assets controls are 44 px touch targets.

**Product Memory validation repair** (`93a86d9`, authorized by Mazen 2026-10-22). It unblocked the deploy, which runs the full suite. The failures came from `52da242`:
- DEC-0008, DEC-0009 and ISS-0015 histories began at their final status; their real 2026-10-21 steps are now recorded.
- ISS-0015 had a short checkpoint, now the full SHA.
- The DEC counter counted DEC-0007, which was saved only on `feature/f8b1-video-renditions` (`d41a378`). DEC-0007 and REV-0023 (which it cites) were carried byte-for-byte, except the short checkpoint `764e3b8` expanded to the full SHA. The REV counter is now REV-0023.
- A blank line inside the Register table was removed.

No decision, status, approval or acceptance changed; no merge. Product Memory now validates: 53 records. The F8-B1 branch itself still carries the short `764e3b8` in those two records, and fails validation there until the same one-line fix is applied.

**Validation:**
- `npm run build` (lint, both typechecks, 2142 tests, 0 failures, 2 pre-existing skips);
- lab browser E2E 73/73 (not signed in, not TESTING);
- other panels pixel-identical to the baseline, 36/36 (timing noise in some runs);
- phone workflow 71/71 at 390×844 and 360×640.

**Pre-existing and unchanged:** the canvas bar overflows at a 900 px desktop width; 4 landscape gesture / keyboard script failures (identical in the baseline).

**Deployment:** site `93a86d99240945d144499e1e66e2b68ad3f9771b`, run `39699314811`. Stamp verified; the changed modules are identical to the tested code; the live editor has no Background rail / More entry and has the Assets switch. No migration and no Edge Function change.

GamID Truth: UPDATED.
- New `wall-assets-background` (PENDING_ACCEPTANCE; contracts `assets-background-navigation`, `-preserved`, `shared-library`).
- `wall-editor-mobile-v2`: `wall-mobile-toolbars` and `wall-mobile-sheets` updated, checkpoint `93a86d9`.

Product Memory: SAVED (validation repair only, as authorized); PROPOSED DEC-0010 (Background inside Assets), not saved.
## 117. Background inside Assets: final navigation order and ACCEPTANCE (2026-10-22)

**Acceptance.** Mazen manually tested the four scenarios requested of him on TESTING `93a86d9`, all successfully, and ACCEPTED Background inside Assets. His message does not list them; no further manual coverage is claimed.

**Final adjustment** (his authorization the same day; product `c832c5b`):
- Assets moved directly above Layout. Rail: Add, Text, Media & Links, Shapes, My Gamer Data, Assets, Layout, Templates (+ phone Edit).
- Phone bottom bar: Add, Assets, Layers, Stages, More.
- Markup order only: no behaviour change, Assets keeps My Assets and Background, no Background tool.
- The rail-order guards were updated deliberately (`wall-editor-desktop-ui`, `wall-w4-editor`), and an order test was added.

**Validation:**
- `npm run build`: 2143 tests, 0 failures, 2 pre-existing skips;
- lab order on screen at five sizes, with Assets / My Assets / Background / Layout / Templates opening: 40/40;
- Background E2E: 73/73; other panels identical: 36/36; phone workflow: 71/71 (390×844 and 360×640).

**Deployment:** run `39702253574`. TESTING serves `c832c5ba751dcd1e50771d98482c3ff1d5a898ee`; the live rail and bar HTML have the final order.

GamID Truth: UPDATED.
- `wall-assets-background` is ACCEPTED (checkpoint `c832c5b`); its navigation contract names the final order.
- In `wall-editor-mobile-v2`, the `wall-mobile-toolbars` bar order is updated (checkpoint `c832c5b`); that capability stays PENDING_ACCEPTANCE.

Product Memory: SAVED (Mazen's approval) DEC-0010 "Background inside Assets" (ACCEPTED) and REV-0024 "final TESTING acceptance" (COMPLETED, PASS); 55 records validate. Not merged; Production untouched.

## 118. Wall editor: 900px canvas toolbar + landscape phone fixes (2026-10-22, PENDING Mazen's acceptance)

Mazen's task "GAMID — 900px CANVAS TOOLBAR + LANDSCAPE MOBILE REGRESSION FIX". The branch is `feature/editor-900-landscape-fixes` (from `735d3e8`; product baseline `c832c5b`). Details are in `docs/WALL-EDITOR-900-LANDSCAPE-FIXES.md`.

**A. Canvas bar at 900–1199px (product).**
- **Cause.** The canvas column is about 264px wide at 900px. The single-line bar's items could not shrink, and `.ed-center` clips overflow. Status, View public page, Unpublish and "1 selected" were cut off; Unpublish was unreachable up to 1199px.
- **Fix.** `editor-desktop.css`: the bar wraps, its items stay whole on one line, and sizes are slightly tighter at ≤1099px.
- **Result.** 0px overflow, nothing clipped or overlapping, from 768 to 1440px in every state.

**B. Landscape phone (844×390 and similar).**

| Check | Root cause | Fix |
|---|---|---|
| Drag (5) | Test | The previously added text stayed selected, and its rotate handle lay over t1 on the small Fit stage. The 30px sideways move also exceeded the stage. The test now deselects first and sizes the move. |
| Resize (6) | Test | Knock-on of the drag failure. |
| Zoom (7) | Test | Portrait-sized margins left a 45px band. Candidates are now picked point by point, avoiding the real overlays. |
| Keyboard (8) | Test and product | Test: a realistic keyboard height. Product (B1): the landscape keyboard sheet started below the Stages bar, contrary to `wall-mobile-keyboard-a11y`. It now runs from the top toolbar to the keyboard. |

- **Also fixed (B2, product).** In landscape the selection bar lay across the lower part of the Fit stage and blocked taps there. It is now a compact block in the left gutter.
- **Baseline check.** The baseline run with the corrected E2E fails only the product checks.

**Validation (lab: real editor code, fake client, Chrome touch emulation; not a device, not signed in):**
- Phone E2E: 81/81 at each of 844×390, 812×375, 740×360, 360×640 and 390×844. New checks cover the selection bar, rotation with an unsaved edit, and the keyboard sheet filling the space.
- Panel pixel non-regression: 36/36. Background E2E: 73/73. Navigation order: 40/40.
- `npm run build`: 2,148 tests, 0 failures, 2 pre-existing skips. New guards are in `tests/wall-editor-900-landscape.test.js`.

**Deployment.**
- Product `b91e4e36db47570416adf37cc4071d3b592f5eb2`, run `39709642185`, successful.
- The stamp reads `b91e4e3`. The served `/wall-editor/` page, `editor-desktop.css`, `editor-mobile.css` and `mobile-shell.js` are identical to the commit.
- Live smoke, not signed in:
  - 900px: the canvas bar wraps;
  - 844×390: the selection bar is a 204px wrapping block, and the keyboard sheet's top is 44px;
  - no page errors.
- No migration and no Edge Function change. Not merged; Production untouched.

**Not changed (reported).** In portrait at 360–375px the selection strip scrolls sideways to reach Deselect (identical on the baseline). iOS Safari and a physical device are not tested.

GamID Truth: NO CHANGE REQUIRED. B1 brings the code into line with the existing `wall-mobile-keyboard-a11y` contract; A and B2 are presentation fixes that no contract describes.

Product Memory: PROPOSED (an ISS record; not saved).

## 119. Mobile Public Wall Visitor V2 (2026-10-22, PENDING Mazen's acceptance)

Mazen's task "GAMID — MOBILE PUBLIC WALL VISITOR V2". The branch is `feature/mobile-public-wall-visitor-v2` (from `0e5ec45`); product `f62a1ff2c801b2879dfcb41f4962b51bf3c498be`. Details are in `docs/PUBLIC-WALL-MOBILE-V2.md`.

**Audit (before).**
- Working: portrait phones, content rendering, media rules and access.
- Missing: stage navigation.
- Requiring adaptation:
  - landscape phones: each stage painted at full width, 844×1501 at 844×390, about four screens per stage;
  - safe areas.
- Broken:
  - rotation lost the visitor's stage (measured: from stage 2 to stage 1);
  - any resize destroyed open players, including fullscreen ones;
  - a Wall the page cannot draw left an empty page.

**Changes** (phones only; tablets and desktops have identical geometry to the baseline):
- one whole stage per screen (stable `svh` height and safe areas): landscape Fit by default, with Wide;
- a stage navigator (Previous / `N / M` / Next; a bar in portrait, a rail in landscape);
- rotation and Fit / Wide keep the stage and place, and videos continue;
- no repaint under a fullscreen player, and an inline player is kept until it is closed;
- a plain message for a Wall that cannot be drawn.

Same renderer, snapshot, data and media rules; no backend change. A first version used scroll snapping; the E2E caught it fighting the visitor at Replay Intro, and it was removed before delivery.

**Validation:**
- `scripts/public-wall-mobile-check.mjs` (local fixtures, Chrome emulation): **200 / 200**.
  - 12 phone sizes;
  - navigation, rotation, players, states and Intro;
  - tablet / desktop, with geometry equal to the baseline.
- `tests/public-wall-mobile-v2.test.js`.
- `scripts/public-mobile-browser.mjs`: pass.
- `scripts/public-desktop-browser.mjs` fails identically on the baseline: a pre-existing Classic desktop assertion.
- `npm run build`: 2,153 tests, 0 failures, 2 pre-existing skips.

**Deployment.**
- Site `446870a8b7e0cf10704f1727a5fc625ad3088b3c`, run `39769649246`, successful. The stamp reads `446870a`, and the visitor files are byte-identical to the commit.
- Live smoke (TESTING files, fixture backend): 194 / 194.
- No real account was opened. GM-TEST-01 has no published Wall.
- No migration and no Edge Function change. Not merged; Production untouched.

**Product Memory.**
- ISS-0016 checkpoint written as the full SHA of the same commit, with Mazen's approval (validation fix; it blocked the build).
- Proposals are pending his approval.

GamID Truth: UPDATED (new `public-wall-mobile-v2`, PENDING_ACCEPTANCE).

## 120. Wall Stages V2: My Stage / Friends Stage, the stage allowance and the empty Friends Stage (2026-10-22/23, PENDING Mazen's acceptance)

Mazen's tasks "GAMID — WALL STAGES V2" (implementation, the empty Friends Stage UX, release). Product Memory DEC-0011. Details are in `docs/WALL-STAGES-V2.md`.

**What it does:**
- Every stage is a My Stage (no type, so every existing stage) or a Friends Stage.
- The maximum is 3 stages in total; 3/0, 2/1 and 1/2 (My/Friends) are valid, and at least one My Stage always remains. A Friends Stage is optional: new stages are My Stages, and only the owner's explicit choice makes one.
- A Friends Stage holds no owner element or background and never shows the owner's Whole-Wall background.
- An empty one shows a display-only message: for visitors "Good friends leave their mark! ✨", for the owner (editor and Preview) "Waiting for your squad! 🎮".
- One server function decides the allowance (3 for everyone; Free 3 / Pro 5 later, Pro not implemented). Save and publish refuse `WALL_STAGE_LIMIT` unless the Wall does not grow; nothing is ever cut.
- Guards: never the last My Stage; only an empty stage becomes a Friends Stage; active stickers would block conversion and deletion (none can exist yet); no template lands on a Friends Stage.

**Not implemented:** the Friends Stickers system, Premium, Pro and the official background catalog (a Friends Stage keeps the plain stage colour).

**Release (2026-10-23):**
- Product `4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7`, Product Memory `4c97ed9`.
- Migrations `20261022120000_wall_stage_types` and `20261022120100_wall_public_publishing_stage_limit` applied in one transaction and recorded in the history.
- Every stored Wall (5 drafts, 2 publications) is byte-identical before and after.
- Site `4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9`, run `39821008183`, successful. The stamp reads `4c97ed9`, and the changed files are byte-identical.

**Validation:**
- Build: 2,174 tests, 0 failures.
- Database rehearsal and live checks: publishing 44/44; W2 shows only its 5 failures that also occur on the baseline.
- Lab E2E: stages 42/42, backgrounds 12/12, owner empty state 36/36, Background inside Assets 73/73.
- Visitor empty state 70/70 (also on the live files); mobile visitor 173/173 on the live files.
- Live editor and public pages show no errors.
- No signed-in owner session, physical device or iOS Safari was tested.

GamID Truth: UPDATED.
- New `wall-stage-types` (PENDING_ACCEPTANCE, limit `wallStagesMax` 3).
- `wall-editor-stages-bar` / `stages-add-appends` now reads "a My Stage ... when the owner's stage allowance allows".

Product Memory: SAVED, with Mazen's approval: DEC-0011 updated (tier direction, optional Friends Stage, the empty Friends Stage message). It is IMPLEMENTED, not accepted.

Not merged; Production untouched.

## 121. Wall Stages V2: Add stage at the stage allowance (2026-10-23, PENDING Mazen's acceptance)

Mazen's retest: at 3 / 3 the Add stage button still looked available and did nothing. Cause: it was a `disabled` button, and the desktop purple gradient had no disabled style.

**Fix (`a084cb1`, frontend only):**
- At the allowance the Stages bar's Add stage is muted grey and reads `MAX N STAGES`, with N from `get_my_wall_stage_allowance` (never a fixed 3).
- It stays focusable and clickable (`aria-disabled`, not `disabled`). A click, Enter or Space shows "You've reached your N-stage limit." in the banner and the stage live region, then returns. No stage is added, the Wall is not changed or marked unsaved, and nothing goes on Undo.
- The phone Stages sheet's Add mirrors it through the same handler.
- Below the allowance it is the purple `+ Add stage` again, for example after deleting a stage.
- The limit, the database rules and save / publish are unchanged.
- The W3/W4 "no stage maximum" source guard now forbids a fixed maximum and requires the message to be built from the allowance.

**Delivery:** site `a084cb17c7c43aa0a84f1099a3f567d297dc98c7`, run `39963845626`, successful. The stamp reads `a084cb1`, and the five changed files are byte-identical to the commit. No migration, no Edge Function change.

**Validation:**
- `npm test`: 2,172 tests, 0 failures.
- Lab E2E stages 60/60, covering:
  - desktop 1440: below the limit; at the limit; repeated clicks; Enter / Space; no unsaved change; save and reload; delete re-enables Add; the label follows a hypothetical allowance of 5;
  - tablet 768 / 1024 / 900: the at-limit label fits inside the bar;
  - phone 390×844 and 844×390: the sheet mirrors it, and a tap explains the limit.
- Backgrounds 12/12, owner empty state 36/36, mobile editor functions all pass, visitor empty state 70/70.
- Live anonymous smoke passes.
- No signed-in owner session, physical device or iOS Safari was tested.

GamID Truth: NO CHANGE REQUIRED. `stages-add-appends` ("when the owner's stage allowance allows") and `wall-stage-allowance` ("Add stage stops there") still hold.

Product Memory: NO CANDIDATES.

Not merged; Production untouched.

## 122. Wall Stages V2 ACCEPTED (2026-10-23)

Mazen explicitly accepted Wall Stages V2 on TESTING after his manual tests on desktop and Android. He checked:
- the stage limit;
- My Stage / Friends Stage conversion;
- persistence;
- the owner and visitor empty Friends Stage messages.

**Accepted checkpoint:** TESTING serves `a084cb17c7c43aa0a84f1099a3f567d297dc98c7` (run `39963845626`, §121): Wall Stages V2 (§120, product `4be5bfc`) plus the Add stage at-allowance fix. Verified by Claude Code before recording: the public stamp reads `a084cb1`, and the served editor, stage-type, Friends Stage and public Wall files are byte-identical to the commit. No `dist/` change since `a084cb1`.

**Recorded (documentation only; no code, schema or deployment change):**
- GamID Truth `wall-stage-types`: ACCEPTED, checkpoint `a084cb1`. Contracts and limits are unchanged.
- Product Memory DEC-0011: ACCEPTED for its implemented scope, with an "Acceptance (2026-10-23)" section listing what is accepted and what is not. INDEX Register updated.
- `docs/WALL-STAGES-V2.md` §7, `PROJECT_STATE.md`.

**Not accepted, not implemented:** the Friends Stickers system and sticker moderation, the official background catalog, Premium, Pro and the Free 3 / Pro 5 tiers. Mobile Public Wall Visitor V2 (`public-wall-mobile-v2`) stays PENDING_ACCEPTANCE.

GamID Truth: UPDATED (`wall-stage-types` PENDING_ACCEPTANCE → ACCEPTED; checkpoint `4be5bfc` → `a084cb1`; record text).

Product Memory: SAVED (DEC-0011 → ACCEPTED, as Mazen explicitly asked in his acceptance task).

Not merged; Production untouched.

## 123. F1–F8 documentation reconciliation and closure (2026-10-23, documentation only)

Mazen's task "GAMID — F1–F8 DOCUMENTATION RECONCILIATION & CLOSURE" approves documentation reconciliation, not implementation. The basis is the read-only F1–F8 audit of 2026-10-23: branch `feature/mobile-public-wall-visitor-v2` at `7cd3b25`, with TESTING serving `a084cb1`. Details: `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md` §8. No measurement was repeated, and no code, migration, worker, infrastructure or deployment changed.

**Final status:**
- **Delivered and accepted** (the authorized scope is complete):
  - F2, F3, F4 (accepted as the implementation baseline, its mechanism superseded by F6-A), F5, F6-A (with its large-file cache limitation), F7-A, F7-C;
  - F8-A, functionally and for new MP4 uploads only;
  - F8-B1 (REV-0023, DEC-0007).
- **F1:** Monitor media-light scans, `gamid-monitor` `9fe1950` on `feature/v3-observer-gemini`. It is implemented and verified, and the change was approved by Mazen (`acceptance/v2/FREEZE.md`). **Formal acceptance evidence was not found;** F1 is not marked accepted.
- **Deferred, not authorized** (not completed, rejected, cancelled or approved for implementation):
  - F6-B, Intro reuse;
  - F7-B, Wall picture display derivatives;
  - migration of existing stored MP4s (F8-A; 5 such files on TESTING, none rewritten);
  - further F8-B options beyond F8-B1 (AV1, re-encoding every video, existing videos, HDR / alpha / 10-bit).
- **Review item, not an approved implementation:** the public crawler route `/@<handle>/intro.webm` streams the Intro through the Worker with `Cache-Control: public, max-age=60`. The Cloudflare CDN terms review that §105 asked for is still outstanding.
- **No performance implementation is currently requested.** Any future work needs Mazen's separate authorization. Nothing implies Production acceptance.

**Changed (documentation only):**
- `docs/WALL-BANDWIDTH-FINAL-BENCHMARK.md`: a dated banner and §8 (historical findings, later acceptance decisions, current verified status, deferred work). §1–§7 are unchanged.
- `docs/WALL-VIDEO-FASTSTART-F8A.md` and `docs/WALL-VIDEO-RENDITIONS-F8B1.md`: dated reconciliation notes in their status banners.
- `PROJECT_STATE.md`: the continuation point.

GamID Truth: UPDATED (record and notes text only; no capability, status, checkpoint, limit or contract changed):
- `wall-video-renditions`:
  - REV-0023 is now cited as COMPLETED, PASS (it had read "proposed"), and DEC-0007 as ACCEPTED;
  - handoff §109–112, doc §8–12;
  - site `764e3b8` described as the first serving checkpoint, carried by every later one;
  - the further F8-B options recorded as deferred.
- `intro-derivative-f2`: the checkpoint `04877c2` is verified as the deployed, accepted product tip, and the record now names `04a67c2` as the commit that introduced the encoding. The checkpoint itself is unchanged.
- `wall-video-url-reuse`: notes that it supersedes F4's per-tab reuse.
- `public-wall-publishing`: notes now record F3's viewport gating. The stale "wall-visibility-toggle (pending acceptance)" is corrected to ACCEPTED, as Truth records it.
- `wall-video-faststart`: the existing-MP4 migration is "deferred and not authorized".
- F1 is Monitor tooling, not GamID product state, so it stays out of Truth.

Product Memory: SAVED (an existing record only, in this authorized task). REV-0022's summary, `related` (REV-0023, DEC-0007) and a dated Reconciliation note record the later F8-B1 acceptance and the closure status. Its findings, decisions and History are unchanged, and the INDEX Register log is updated. No new record: a closure review would duplicate REV-0022 / REV-0023.

Not merged; Production untouched.

## 124. Friends Stickers V1 (2026-10-24, PENDING Mazen's acceptance)

Mazen's task "GAMID — FRIENDS STICKERS V1" and its addendum (sender avatar + optional gaming clip link), TESTING only. Full record: `docs/FRIENDS-STICKERS-V1.md`. Wall Stages V2 (accepted) is preserved.

**What was built:**
- **Sending.** A signed-in player with a public GamID sends one of 14 free animated stickers to a Friends Stage of another player's published Wall, with a position and optionally one YouTube / Twitch / Medal.tv clip link.
  - Entry points: the editor's Templates & Stickers → Stickers (player search), and Add sticker on that Wall (eligible visitors only).
- **Owner.** Every sticker waits for the owner's approval; the owner sees the sender, the stage and the link first.
  - The owner approves or rejects, removes (asked once), and drags (desktop and touch; one notice to the sender per saved move).
  - The pending count shows on the Templates & Stickers tool and in the Friends Stage panel, live.
- **Display.** Approved stickers only, each always with the sender's current avatar and @username beside it, plus a new-tab clip button only when a link exists.
  - Size = max(50, 100 − 5 × newer active stickers on the Wall).
- **Background.** Every Friends Stage shows the supplied 9:16 official background.

**Checkpoint A** (before implementing):
- Every Wall stage is a 9:16 portrait canvas on every device, so the first, landscape background could not fill a Friends Stage. Mazen then supplied the portrait background.
- His other choices were left to the recommended defaults (he asked to continue):
  - senders: any signed-in player with a public GamID;
  - stickers: 384 px files built from the originals (130 MB → 31.5 MB, all 72 frames, loop, alpha);
  - clips: YouTube / Twitch / Medal.tv (Discord media links expire).

**Delivery:**
- Product `524939cfda495abb3f90534b53914ffc634038b2`.
- Migration `20261024100000_friends_stickers_v1`: rehearsed in a rolled-back transaction, then applied and recorded in the history. It is additive; every stored Wall is unchanged.
- Site run `40079878018`: stamp `524939c`, 25/25 checked files byte-identical.
- Live smoke 9/9 (anonymous, read-only).

**Validation:**
- `npm test`: 2,192 tests, 0 failures (20 new).
- Browser: editor 54/54 (desktop, tablet, phone touch) and visitor 34/34.
- Non-regression: Wall Stages 60/60, backgrounds 12/12, owner empty state 36/36, visitor empty state 70/70, the mobile editor functions, Mobile Public Wall Visitor V2 196/196.
- No real signed-in account, physical device, Safari or Firefox was tested.

**Manual acceptance checklist (Mazen):**
- **Setup.** The Wall owner (account A) has a Friends Stage on a published, enabled Wall. A second account (B) has a public GamID.
1. **Official background:** the Friends Stage shows it in the editor, Preview, the public Wall (desktop) and on Android, and it cannot be changed.
2. **Android, from the Wall:** B opens A's `/@handle` → Friends Stage → Add sticker → chooses a sticker → drags it into place → pastes a YouTube, Twitch or Medal.tv clip link → Send. An unsupported link is refused before sending.
3. **Desktop, from the editor:** B uses Wall editor → Templates & Stickers → Stickers → chooses a sticker → Send sticker → searches A → picks the right player and Friends Stage → positions it → Send.
4. **Request:** A gets a notification and the pending badge. Templates & Stickers → Stickers (or the Friends Stage panel) shows each request with B's avatar, @username, the stage and the link.
5. **Privacy:** before A decides, signed out on `/@A` nothing of the requests is visible.
6. **Approve and reject:** A approves one and rejects another. B is notified both times; only the approved one appears publicly.
7. **Public display:** signed out, the approved sticker shows with B's avatar and @username always visible. The clip button appears only on the one with a link and opens the clip in a new tab.
8. **Move:** A drags the approved sticker (desktop, then Android touch). B is notified once per move, and the sticker is in the same place on phone and desktop.
9. **Sizes:** with several approved stickers, the newest is largest and each older one 5 points smaller (minimum 50%). Removing one (asked first) restores the others' sizes.
10. **Stage rules:** with stickers on it, the Friends Stage can be neither deleted nor turned into a My Stage (the editor says why). After removing them, it can.
11. **Current avatar:** B changes their avatar, and A's Wall shows the new one beside B's sticker.
12. *(Optional)* With reduced motion on, the stickers show as still images.

GamID Truth: UPDATED.
- New `friends-stickers` (PENDING_ACCEPTANCE, checkpoint `524939c`, six contracts, limits).
- `wall-stage-types` (still ACCEPTED): its `wall-friends-stage`, `wall-friends-stage-empty-message` and `wall-stage-conversion` contracts amended (the official background and stickers, no "coming soon" badge, real sticker counts), with a note.

Product Memory: PROPOSED (not saved; awaiting Mazen's approval). See the completion report.

Not merged; Production untouched.

## 125. Friends Stickers V1 follow-up corrections (2026-10-24, PENDING Mazen's acceptance)

Mazen's task "GAMID — FRIENDS STICKERS V1 / Follow-up Corrections", TESTING only. Full record: `docs/FRIENDS-STICKERS-V1.md` §10. Friends Stickers V1 stays PENDING_ACCEPTANCE.

**Privacy conflicts, reported first and decided by Mazen** (both recommended options):
- A private sender's approved sticker keeps showing their avatar and @username. This narrows the accepted `visitor-media-access` rule for the current avatar of a PRIVATE GamID only (a second storage policy; DRAFT avatars stay owner-only).
- A PRIVATE GamID's `/@handle` shows a private notice: avatar, display name, @username and "This account is private." Nothing else is read or shown. Unknown and unpublished handles keep the identical not-found page.

**What changed:**
- **Private senders:** their approved stickers stay. The avatar + @username open the sender's GamID (public Wall: same tab with Back to the Wall; editor Preview: new tab; never on the drag canvas).
- **Quota:** 5 counted submissions per sender in any rolling 24 hours, across all recipients (replaces 5 waiting per Wall / 20 per hour). A ledger row per send counts while pending or approved, also after removal or deletion, until 24 h after the send; a rejection releases it at once. The count and the insert happen under the sender's transaction lock. The send flow shows what is left, or when the next slot frees. Pro (10) is not approved or built.
- **Discord:** message permalinks `discord.com/channels/<guild>/<channel>/<message>` (www / ptb / canary and discordapp.com rebuilt to discord.com). DM links and file links (cdn.discordapp.com, media.discordapp.net) are refused. Only a link: no API, download or embed; channel permissions apply.
- **Fixed:** on short landscape phones the send flow's stage preview could collapse to 0 px.

**Delivery:**
- Product `6a7b89a9a62a23948f6c121ca11734fb36fe1796`.
- Migration `20261025100000_friends_stickers_corrections`: rehearsed (rolled back), applied and recorded in the history. It is additive; the one existing placement got its ledger row.
- Site run `40098732831`: stamp `6a7b89a`; the changed files are byte-identical to the commit.
- Live smoke (anonymous, read-only): stickers 9/9, Wall Stages smoke passes.
- Rollback: redeploy `524939c` (run `40079878018`); undo steps in the doc.

**Validation:**
- `npm test`: 2,198 tests, 0 failures.
- Browser: editor 59/59, visitor 46/46.
- Non-regression: Wall Stages 60, backgrounds 12, owner empty state 36, visitor empty state 70, the mobile editor functions, Mobile Public Wall Visitor V2 196/196.
- No real signed-in account, physical device, Safari or Firefox was tested; true parallel sends are covered by the lock order, not a live race.

**Manual acceptance checklist (Mazen):**
- **Setup.** Accounts A and C each have a Friends Stage on a published, enabled Wall; account B has a public GamID.
1. **Quota across recipients:** B sends 5 stickers spread over A's and C's Walls. The send flow counts down ("You can send N more…"). The sixth is refused with the time the next one frees.
2. **Rejection releases:** A rejects one of B's pending stickers. B can send one more at once.
3. **Approved, removed and deleted still count:** A approves one and then removes it. B's count does not go down.
4. **Private sender:** A approves a sticker from B; B then makes their GamID private. Signed out, A's Wall still shows the sticker with B's avatar and @username.
5. **Profile link:** clicking B's avatar or @username on A's Wall opens B's GamID in the same tab; Back returns to A's Wall. In the editor's Preview it opens in a new tab.
6. **Private notice:** signed out, B's `/@handle` (while private) shows only the avatar, name, @username and "This account is private." An unknown handle shows the normal not-found page.
7. **Discord:** a Discord message link (Copy Message Link) is accepted and its clip button opens Discord in a new tab. A `cdn.discordapp.com` file link is refused with the "Paste the message link instead" message. YouTube, Twitch and Medal.tv links still work.
8. **Phone landscape:** on Android in landscape, the send flow's stage preview is visible and the sticker can be dragged into place.

GamID Truth: UPDATED.
- `friends-stickers` (still PENDING_ACCEPTANCE): checkpoint `6a7b89a`; limit `stickerQuotaPer24Hours: 5` replaces the two anti-spam limits; `sticker-send`, `sticker-display` and `sticker-clip-link` amended; new `sticker-quota` and `private-identity-notice` contracts; record and notes.
- `visitor-media-access` (ACCEPTED): its `visitor-no-signing` rule amended for a PRIVATE GamID's current avatar (Mazen's decision).
- `public-gamid-profile` and `public-handle-url` (ACCEPTED): notes on the private notice.

Product Memory: PROPOSED (not saved; awaiting Mazen's approval). See the completion report.

Not merged; Production untouched.

## 126. Notifications "Mark all as read" + Friends Stickers clip button (2026-10-25, PENDING Mazen's acceptance)

Mazen's task "GAMID — Notifications & Friends Stickers UI Fix", TESTING only. A focused correction; no redesign, no database change.

**Root cause (Mark all as read not visible):**
- The bulk action already existed and is ACCEPTED (Truth `notifications`): the button in the panel head and `mark_all_my_notifications_read`.
- The shared Notifications panel had `z-index: 45`. Wall Stages V2 (§120) added the editor's stage bar (`.ed-stage-bar`) with the same `z-index: 45`, later in the page. The stage bar therefore painted over the panel's head (title + "Mark all as read"), while the rows below with their Mark read buttons stayed visible.
- Classic (`/account/`), Crew and Play Together were not covered: there the button was visible but small and pale.
- The public Wall has no notifications (the authenticated shell never mounts on public pages). The phone Wall editor (Mobile Wall Editor V2) hides the desktop header while editing, so it has no bell. Both are unchanged.

**What changed:**
- `dist/notifications/notifications.css`: the panel uses `z-index: 10000`, as the Usage panel beside it. "Mark all as read" is a clearer cyan pill (larger text, focus ring); a panel status line for errors.
- `dist/notifications/notification-center.js`: the existing bulk read is reused; no new RPC or table.
  - It marks every unread notification of the signed-in person up to the newest id the page has loaded, including older ones never listed. The server scopes it to the caller.
  - It is shown as done only after the server confirms it: "Marking…", busy and disabled meanwhile; a second click does nothing.
  - A failure changes nothing and says "Couldn't mark your notifications as read. Try again." for ~3 s.
  - Afterwards the list and count are re-read after any re-read already under way. A notification that arrived meanwhile (higher id) stays unread, and a stale re-read cannot undo the result.
  - Individual Mark read is unchanged.
- `dist/wall-kit/wall-kit.css`: the clip (play) button's inset is now `max(3%, 25% − button size)` (top and right). While the button scales with the sticker (box ≥ ~153 px, desktop) it moves from 3% to 8% of the box from the corner (e.g. 5 → 14 px on a 176 px sticker). At its 26 px minimum (phones, small stickers) it keeps 3%, where it already touches the artwork. Avatar, @username, saved positions, sizing and clip links are unchanged.

**Delivery:** product `1aba37844405d5c66e7777d453725b308b74a1f6`; site run `40182003937` (stamp `1aba378`); the three changed files are byte-identical live. Live anonymous smoke 9/9. Rollback: redeploy `6a7b89a` (run `40098732831`).

**Validation:**
- `npm test`: 2,205 tests, 2,203 pass, 0 failures. New: the bulk read covers unlisted rows; no false success, plus transient failure feedback and the busy state; an arrival during the request stays unread and a stale re-read cannot undo it; the panel stays above page bars; the clip inset is pinned and the caption CSS is pinned by hash.
- Database: `tests/integration/notifications-db.sql` on TESTING (always rolled back) 31/31, including "C cannot mark B's notifications read" and "a newer one stays unread".
- Browser (lab, fake client): 88/88. Wall editor at 1024/1280/1440/1920, Classic at 1440/390/844×390, Crew and Play Together at 1440/390: the button is visible and on top, 40 unread → Mark read → Mark all as read with a notification arriving mid-request → badge 1; the failure path.
- Friends Stickers: editor 59/59, visitor 46/46 (clip links incl. Discord). Clip probe of the 14 stickers at 1440/390/844×390: no overlap with the caption or other stickers, always inside the stage. Mobile Public Wall check 196/196.
- Not tested: a real signed-in account, persistence across a real refresh/device (covered by the server RPC and the DB test), physical devices, Safari, Firefox.

**Manual checks (Mazen):**
1. **Wall editor (desktop):** with unread notifications, open the bell. The panel head with "Mark all as read" is fully visible above the stage bar.
2. Click Mark read on one: the count drops by one.
3. Click Mark all as read: briefly "Marking…", then the badge disappears and every row shows as read. Also check older rows ("Show older").
4. Refresh, then open Classic on another device: the notifications are still read and the badge stays clear.
5. **Classic (`/account/`), desktop and Android:** the same, with the more visible button.
6. **Arrival:** while another account sends you something, the new notification stays unread after Mark all as read.
7. **Stickers:** on a published Friends Stage with a clip sticker, the play button sits a little closer to the sticker on desktop; on Android it is where it was. It opens the clip in a new tab; the avatar and @username look and behave as before.

GamID Truth: NO CHANGE REQUIRED (restores the accepted `notifications` behaviour; the clip button change is cosmetic).

Product Memory: PROPOSED (not saved; awaiting Mazen's approval). See the completion report.

Not merged; Production untouched.

## 127. Notifications "Mark all as read" + sticker clip button ACCEPTED (2026-10-25, documentation only)

Mazen personally tested both fixes of §126 on TESTING `1aba378` (run `40182003937`) and accepted them on 2026-10-25:
- **Mark all as read:** the button is visible and works correctly.
- **Friends Stickers clip (play) button:** the adjusted position is correct and approved.

Three kinds of evidence, kept apart:
- **Claude Code's automated tests** (before acceptance; §126 has the detail):
  - `npm test`: 2,205 tests, 0 failures;
  - the notifications database test on TESTING (rolled back): 31/31;
  - lab browser: notifications 88/88, stickers editor 59/59 and visitor 46/46, Mobile Public Wall 196/196.
- **TESTING deployment verification** (Claude Code): run `40182003937` succeeded; the changed files are byte-identical live; the stamp is `1aba378`; live anonymous sticker smoke 9/9.
- **Mazen's manual acceptance:** both fixes, on TESTING. His acceptance names no devices, browsers or scenarios, so none are claimed.

This covers these two fixes only. Friends Stickers V1 as a whole (Truth `friends-stickers`) stays PENDING_ACCEPTANCE (§124, §125).

GamID Truth: NO CHANGE REQUIRED. It restores the accepted `notifications` behaviour, and the clip position is cosmetic (no limit or contract names it).

Product Memory: SAVED, with Mazen's authorization: ISS-0017 (VERIFIED) and REV-0025 (PASS). ISS-0017 was free in every branch; an earlier unsaved Mobile Public Wall proposal that named ISS-0017 takes a new ID if it is saved.

No product change, deployment, merge or Production access.

## 128. Friends Stickers V1 ACCEPTED (2026-10-25, documentation only)

Mazen gave his **FINAL ACCEPTANCE of the entire Friends Stickers V1 system** on TESTING on 2026-10-25, with no remaining feedback or requested changes. This is full feature acceptance, not only of the two fixes in §127.

**Scope accepted:** as deployed at site `1aba378` (run `40182003937`):
- V1 (§124; product `524939c`, migration `20261024100000_friends_stickers_v1`);
- the follow-up corrections (§125; product `6a7b89a`, migration `20261025100000_friends_stickers_corrections`);
- the clip button position (§126).

**Verified before writing this:**
- The branch matches its origin at `238e23c`.
- The live TESTING stamp is `1aba378`.
- Truth's contracts and limits match `docs/FRIENDS-STICKERS-V1.md`.

**Evidence, kept apart:**
- Claude Code's automated tests and TESTING deployment verification (§124–§126).
- Mazen's acceptance, which names no devices, browsers or scenarios.

GamID Truth: UPDATED.
- `friends-stickers` changes from PENDING_ACCEPTANCE to ACCEPTED. Its record and notes now state the acceptance.
- Unchanged: its limits, contracts and checkpoint `6a7b89a`.
- Wording reconciled in the notes of `public-gamid-profile` and `wall-stage-types`, which called friends-stickers pending. Their statuses are unchanged.
- `updated` 2026-10-25. No other capability changes status.

Product Memory: SAVED, with Mazen's authorization.
- New REV-0026 (PASS).
- DEC-0011 stays ACCEPTED and gains "Acceptance (2026-10-25)" (what of its sticker direction is now implemented and accepted) plus a dated History note.
- REV-0025 and ISS-0017 are unchanged.

**Still not built and not accepted:**
- sticker expiry, Delete All Stickers and per-friend allowances;
- Writing Stickers;
- the official background catalog and Premium backgrounds;
- Premium, Pro (10 per 24 h), Boost, paid stickers and any subscription;
- clip embedding.

No product change, migration, deployment, merge or Production access.

## 129. Pro Effects: Living Ice V5 + Living Radiation V1 (2026-10-25, feature branch only - NOT deployed)

Mazen's task "GamID Pro Effects Integration". It authorises implementation on `feature/mobile-public-wall-visitor-v2` only: no deployment, merge or Production. Full record: `docs/WALL-PRO-EFFECTS.md`.

**Starting point:** HEAD `547fcf0`, verified against origin.
**Product:** `dcd5236055141dd3c9b2ba45b4de1ee0bf32b3c6`, pushed.
**TESTING:** unchanged; it still serves `1aba378`.

**What it is:**
- **Category.** Text Effects → **Pro Effects**: Neon, Living Fire, Living Ice and Living Radiation, all free. `tier` only identifies each effect; nothing restricts them.
- **Choosing an effect** applies it at once, in one undo step: to the selected text(s), keeping their words, or as a new selected text "Write something about yourself here". An empty text gets the placeholder. Choosing it again changes nothing. There is one Pro Effect per text.
- **Properties.** The "<EFFECT> EFFECTS" section comes first and expanded, with only its own controls and Remove effect. The general sections follow, collapsed. The phone does the same; the 600–899px panel is unchanged.
- **The two packages** match their MANIFESTs: Radiation 74/74, Ice 47/47.
  - Shaders, Ice's freezing clocks and crystal placement are copied verbatim, by script, and pinned by hash.
  - They are hosted like Living Fire, with ONE shared live budget of 4 for every animated effect.
- **Ice adaptations.** The text's own letters instead of "FROZEN"; transparent misses (the only shader change); master camera only; 2× sampling.
- **Ice device safeguards (measured).**
  - One draw costs about 0.2 ms on a GPU but 400–550 ms with software rendering, where the page had fallen to 1–3 fps.
  - Ice is therefore never drawn on a software renderer, and gives up after 3 draws over 100 ms.
  - The page then stays at 60 fps with the static fallback.
- **Persistence.** Saved as `payload.ice` (12 keys) and `payload.radiation` (19 keys), the packages' contracts.
  - Migration `20261025120000_wall_text_ice_radiation` adds two revoked helpers and two new lines in the text validator.
  - Database parity was tested on PGlite over the whole corpus.
  - **Not applied to TESTING.**

**Validation:**
- `npm run build`: 2219 tests, 0 failures.
- Lab browser: desktop editor 36/36 (create, apply, switch, undo, save, reload, Preview, visitor view, reopen, shared budget, cleanup); phone 16/16 at 390 × 844 and 844 × 390; reduced motion 1/1.
- Non-regression: stickers 59 + 46, stages 60, backgrounds 12, Friends Stage 36 + 70, mobile functions 9, Mobile Public Wall 196.
- Performance on Chrome: RTX 3060 and SwiftShader, numbers in the doc.
- Not tested: TESTING, a signed-in account, physical phones, Safari, Firefox.

**GamID Truth: NO CHANGE REQUIRED** in this task. Truth records what exists on TESTING, and nothing changed there. The exact Truth delta for the deployment task is in the doc, §7: new `pro-effects`, `living-ice-text` and `living-radiation-text` (PENDING_ACCEPTANCE); `living-fire-text`'s editor and rendering contracts amended.

**Product Memory: NO CHANGE** — approval not granted.

**Needs Mazen:**
1. Authorisation to apply the migration and deploy to TESTING.
2. A decision on the packages' code provenance.
3. Manual acceptance.

Not merged; Production untouched.

## 130. Pro Effects on TESTING (2026-10-25, PENDING Mazen's acceptance)

Mazen authorised deployment to TESTING only, for his own test of Living Ice and Living Radiation. Details: `docs/WALL-PRO-EFFECTS.md` §8.

- **Product:** `dcd5236`. **Site:** `fb8708e` (run `40191766463`); the 17 changed files are byte-identical. `npm run build`: 2219 tests, 0 failures.
- **Migration** `20261025120000_wall_text_ice_radiation`: rehearsed (8/8, rolled back) and APPLIED.
  - It supersedes the unrecorded TESTING-only experiment `20261020114332_wall_text_living_radiation`: the same radiation rule, now in the repository, plus Ice.
  - No stored Wall was affected.
- **Live anonymous smoke** (desktop and phone): the Pro Effects category is in the editor; Fire, Ice and Radiation draw live from TESTING's own files; Neon glows.
- **GamID Truth: UPDATED.**
  - New: `pro-effects`, `living-ice-text` and `living-radiation-text`, all PENDING_ACCEPTANCE.
  - `living-fire-text` stays ACCEPTED; its `living-fire-editor` and `living-fire-rendering` contracts are amended, with a note that the amendment awaits acceptance.
- **Product Memory: NO CHANGE** — approval not granted.

**Manual test (Mazen), on desktop and Android:**
1. Wall editor → Text → **Pro Effects**: four cards (Neon, Living Fire, Living Ice, Living Radiation), all usable.
2. With nothing selected, choose **Living Ice**. A new text "Write something about yourself here" appears, frozen, and Properties opens on LIVING ICE EFFECTS (general sections collapsed). Choosing it again adds nothing.
3. Type a short word (e.g. your name) in a bold font and try the Preset, the four colours and the sliders.
4. Choose **Living Radiation** on the same text: the heading and controls switch. Try Style, Colour, Waveform and Atmosphere. The wave passes about every 9 s at the defaults.
5. Select an existing text and choose an effect: its words stay. Undo and redo.
6. **Save → Preview → Publish**, then open your `/@handle` signed out: the effects play there too.
7. Reopen the editor, change a setting, Save and Publish again.
8. *(Optional)* With reduced motion on, still frames show.

Not merged; Production untouched.

## 131. Pro Effects ACCEPTED (2026-10-25, documentation only)

Mazen reviewed the new Pro Effects on TESTING (site `fb8708e`, run `40191766463`; product `dcd5236`) and gave his **FINAL ACCEPTANCE of the current implementation**.

- **GamID Truth: UPDATED.**
  - `pro-effects`, `living-ice-text` and `living-radiation-text` move from PENDING_ACCEPTANCE to ACCEPTED, with their records and notes.
  - `living-fire-text` stays ACCEPTED: its amended `living-fire-editor` / `living-fire-rendering` contracts are kept, and its note now records their acceptance.
  - Limits, other contracts and checkpoints are unchanged.
- **Product Memory: SAVED,** with Mazen's authorization: REV-0027 (PASS). REV-0012 and REV-0013 are unchanged.
- **Evidence:** Claude Code's tests and TESTING verification are in §129–§130. Mazen's acceptance names no devices, browsers or scenarios.

No product change, deployment, merge or Production access.

## 132. Text panel accordion (2026-10-25, PENDING Mazen's check)

Mazen's task "GamID — Text Panel Accordion UX Improvement", TESTING only.

**What changed:** Pro Effects, My Fonts and Upload My Font are accordions, one open at a time (Pro Effects at first), with clickable headings and chevrons. The content and behaviour inside each section are unchanged. Desktop and phones; the tablet layout is unchanged. Details: `docs/WALL-EDITOR-TEXT-EFFECTS.md` (Text panel accordion).

**Delivery:** product `9ee23d8634232146602dc232589e626db5e1e8ab`, TESTING run `40194686665`; the 3 changed files are byte-identical live, and the live editor builds the accordion (Pro Effects open) on desktop and phone with no page errors.

**Validation:**
- `npm run build`: 2220 tests, 0 failures (+1 test).
- Lab accordion walk-through, 25/25:
  - every section opens and closes, with only one open; keyboard;
  - Living Ice applies and draws live; a library font applies;
  - upload without a licence is refused; two real WOFF2 uploads succeed; choose and delete with confirmation; the messages show in the open section;
  - Save and Preview work;
  - phone 390 × 844: 44px headings, exclusive opening, a Pro Effect still applies, no horizontal scroll;
  - tablet: the sections are still hidden.
- Regression: Pro Effects 36/36 desktop and 17/17 phone; stickers 59; stages 60; Friends Stage editor 36; mobile functions 9; live anonymous effects smoke 8/8 (the only console errors are the existing signed-out 401 and the favicon).

GamID Truth: NO CHANGE REQUIRED (a layout change; no capability or contract changes).
Product Memory: NO CHANGE — approval not given.
Not merged; Production untouched.

## 133. Discord share card (Components V2) on TESTING (2026-10-26, PENDING Mazen's visual review)

Mazen's task "GamID Discord Components V2: Implement & Deploy to TESTING".

**What it is:** a shared `/@<handle>` link now shows, in Discord, the approved lab card with real public data:
- the name and @handle · GAMID;
- two Gaming Roles plus "+N more" (plain text);
- the public Location and the avatar tile;
- the Banner;
- "My Gaming Intro" with the public Intro;
- Open GamID, which goes straight to `/@<handle>`.

Other platforms keep the unchanged Open Graph preview. Details: `docs/DISCORD-SHARE-CARD.md`.

**Branch:** `feature/discord-share-card-v2`, from `692369f` (the deployed `9ee23d8` plus docs). The REV-0028 records were cherry-picked onto it. `b9aa4c7` (Font Library order) is deliberately not on it, because it isn't authorized for deployment.

**Product:** `8306d90b6c69c3c99511bbd84efebdc583bad101`. `social-card` was redeployed on TESTING (`supabase functions deploy social-card --use-api`); live, `variant=avatar` returns the 256 × 256 avatar tile, or the letter tile for an unknown handle.

**Not done:**
- **Gender:** GamID has no gender field.
- **Thumbnail-first:** no share copy exists; it needs new Intro processing.

**Cloudflare terms:** the existing `/@<handle>/intro.webm` Supabase stream is reused unchanged, the same path as `og:video`. The terms question stays open (REV-0028).

GamID Truth: UPDATED. New capability `discord-share-card` (PENDING_ACCEPTANCE), with its layout, privacy and media contracts and limits (3,000-byte payload, 2 named roles, 256 px tile). `public-handle-url` gains a note; its status and contracts are unchanged.

**Delivery:** site `850d85e14b84152c9dee4789c5d298d135f40f8f`, TESTING run `40315368959`. Every workflow step succeeded, including the full validation and smoke checks; the live asset stamp is `850d85e`.

**Validation:**
- `npm run build`: 2234 tests, 0 failures, 2 skipped (+14 tests in `tests/discord-share-card.test.js`).
- **Live, anonymous:**
  - `/@black` carries one card (1,008 bytes).
  - Its text: "Espada", `@black · GAMID`, "GAMING CONTENT CREATOR · CASUAL GAMER · +9 more", "📍 Jeddah, Saudi Arabia".
  - Its media: avatar tile 200 image/png, Banner 200 image/jpeg, Intro 206 video/webm. Open GamID opens `/@black`.
  - `/@zshot` (no public roles, Location or Banner) has only the name, avatar, Intro and Open GamID.
  - An unknown and a malformed handle get no card and the generic page.
  - No storage path or key is in any payload.
- **Not yet seen rendered in Discord:** the Developer Portal Embed Debugger needs a sign-in, and posting the real link in #clips-test needs Mazen's OK.

## 134. Discord share card Version A on TESTING (2026-10-26, PENDING Mazen's visual review)

Mazen approved Version A from the three-way visual mockup: current, A (structured), B (compact). He authorized implementing it and deploying it to TESTING only. Final acceptance is not granted.

**Changes:** only `cf-worker/discord-card.mjs` and its tests.
- The accent is `#B14CFF` instead of `#62E7FF`.
- A divider with large spacing (`spacing: 2`) sits between the header, Banner, Intro and footer. Only parts that are present get one, so there are never two in a row and none at the ends.
- Roles and Location are `-# ` subtext.
- `### 🎮 My Gaming Intro` is a heading.
- The footer line is bold, and "GAMID" in the header is bold in full.

Unchanged: the data, privacy rules, media URLs, `+N more` (plain text), Open GamID, `social-card`, and every other platform's preview.

**Product:** `7507d1243e2465257cb4d6227e503379f9be2d0c`.

**Deployment:** the docs head `5253134` went to TESTING in run `40320154256` (success; full validation 2,234 tests, 0 failures, 2 skipped). The live asset stamp is `5253134`.

**Anonymous live check:** both cards measured against the live page.
- **`@black`** (1,102 B):
  - accent `#b14cff`;
  - types `[9,14,12,14,10,12,14,9]`, with three `{divider: true, spacing: 2}` separators;
  - subtext roles (`+9 more` plain) and Location;
  - avatar 200 PNG, banner 200 JPEG, Intro 206 WebM;
  - Open GamID → `/@black`.
- **`@zshot`** (no Banner or Location): types `[9,14,10,12,14,9]`.
- **Unknown or invalid handle:** no card.
- **Discord rendering:** not yet checked; posting the real link needs Mazen's OK.
- **Discord rendering, later the same day (Mazen's OK):** checked in #clips-test with `@black?v=a1`. The card shows the purple accent, three grey dividers, the banner, an Intro that plays in Discord (1920 × 1080), and Open GamID → `/@black`.

## 135. Discord card divider live tests B1 / B2 on TESTING (2026-10-26, PENDING Mazen's decision)

Mazen asked for purple dividers in place of the grey ones and authorized live tests of both options on TESTING only. Discord's Separator has no colour field (official Components V2 reference), so each divider becomes a one-item Media Gallery of a thin line image from this site's `/assets`. See `docs/DISCORD-SHARE-CARD.md` → Divider live tests.

**What is unchanged:** the avatar, banner, Intro, profile data, Open GamID, the privacy rules and `social-card`. Version A's native Separators stay in the code as the rollback baseline.

**B1, static purple line:** `a9c0182` (`discord-divider-purple.png`, 1200 × 8, 153 bytes). Deployed as docs head `46a9752` in run `40330646016`.
- **Live JSON:** `@black` is 1,366 B with 15 components (Discord allows 40). The image returns 200 `image/png`, and unknown or invalid handles still get no card.
- **Discord** (`@black?v=b1`, desktop web): each line renders full width at 566 × 3.8 CSS px. There is no letterbox, box or extra padding.
  - **Spacing:** slightly tighter than Version A's large-spacing Separators.
  - **Clicking:** a line is clickable (pointer cursor), and a click opens Discord's image viewer showing the line.
  - **Alt text:** Discord gives the image its default alt text "Image".
- **Phone width:** not checked. The Chrome window could not be resized.

**B2, animated glow line:** `2d08e89` (`discord-divider-gradient.gif`, 1200 × 8, 60 frames at 20 fps, 112,305 B). Deployed as docs head `bda173d` in run `40331749356`; TESTING serves B2.
- **Live JSON:** `@black` is 1,372 B with 15 components. The GIF returns 200 `image/gif`, and unknown or invalid handles still get no card.
- **Discord** (`@black?v=b2`, desktop web): same size and placement as B1, 566 × 3.8 CSS px.
  - **Animation:** the glow moves along the lines.
  - **"Play GIFs when Discord is focused" off:** the lines show the GIF's first frame (pink ends) and animate only while hovered.
  - **Reduced Motion on:** Discord automatically switches GIF playback off, so the result is the same as autoplay off.
  - **Settings:** Mazen's settings were restored afterwards (Reduced Motion off, Sync on, GIFs and animated emoji on).
- **Evidence:** screenshots and a recording made from real captures are in `.review/discord-divider-live/`, which is not committed.

**Decision:** Mazen selected **B1** the same day, and the card is back on the static purple line from `b110f07`. B2's GIF is no longer used. This authorizes TESTING only; final acceptance of the card is still pending.

GamID Truth: UPDATED. The `discord-share-card-layout` contract now describes the line-image dividers as a test, with Version A as the rollback. New limits: divider image 1200 × 8 px. The checkpoint is `2d08e89`.

GamID Truth: UPDATED. The `discord-share-card-layout` contract describes the Version A styling (accent, dividers, subtext, headings), and the checkpoint is `7507d12`. Status stays PENDING_ACCEPTANCE.

## 136. Intro Thumbnail for Discord: implemented locally (2026-10-26, NOT deployed)

Mazen's task "Implement Intro Thumbnail Selection for Discord" (2026-10-26): the owner picks a frame of their saved Intro, and Discord shows it before Play. Play still runs the whole Intro from 0:00 in sync. See `docs/INTRO-DISCORD-THUMBNAIL.md`.

**Product commit:** `02c98c5` on `feature/discord-share-card-v2`.
- **Editor:** a frame picker in the Intro section, shared by desktop and mobile. Saved with Save Changes and restored on reopen. No image upload.
- **Migration** `20261026120000_intro_discord_thumbnail.sql`, **not applied**: the selection columns, the private `intro-share-copies` bucket (not counted in quota), the `intro_share_copies` queue, and the owner, visitor and worker RPCs, the sweep and dispatch.
- **Worker** `worker/intro-share.mjs`: 1 chosen frame plus the whole Intro at the unchanged D3 settings, with the audio delayed by one frame. It runs in the existing image and Job, which are **not redeployed**.
- **Cloudflare Worker:** the card's Intro becomes `/@<handle>/intro-discord.webm` when a copy is ready. og:video, the `/intro.webm` route and the B1 card are unchanged. **Not redeployed.**
- **Rollout script:** `worker/cloud-run/deploy-intro-share-testing.sh`, reviewed and not run.

**Tests:** `npm run build` passed: 2,258 tests, 0 failures, 3 opt-in skips. The native ffmpeg check (`GAMID_NATIVE_FFMPEG=1`) also passed at 30, 29.97 and 60 fps:
- the chosen frame comes first;
- every Intro frame follows unchanged;
- the audio moves by one frame.

**Deployment prerequisites** (each needs Mazen's approval):
1. Apply the migration on TESTING.
2. Rebuild and redeploy the worker image (Job and dispatcher) from Cloud Shell.
3. Deploy the site and Worker.
4. Run the live checks: desktop and mobile; Discord Web, the desktop app and a phone.

The Cloudflare video-terms question (REV-0028, proposed ISS-0018) remains open.

GamID Truth: UPDATED. `discord-share-card` notes record the local implementation. Its media contract still describes TESTING, where no share copy is deployed. Status and checkpoint unchanged.

## 137. Intro Thumbnail for Discord: deployed on TESTING and checked end to end (2026-10-27, PENDING_ACCEPTANCE)

Mazen's task "Complete Intro Thumbnail Deployment & Acceptance on TESTING". Details, method and measurements: `docs/INTRO-DISCORD-THUMBNAIL.md`, "TESTING deployment".

**Deployment** (existing infrastructure only; Production untouched; not merged):
1. **Migration** `20261026120000_intro_discord_thumbnail`: rehearsed in a rolled-back transaction, applied in one transaction, recorded with `migration repair`. Usage was unchanged for every owner, and the existing Intros were untouched.
2. **Worker image, Job and dispatcher:** deployed by Mazen in Cloud Shell, `deploy-intro-share-testing.sh` at `ee08a4a` (worker code identical to `02c98c5`). The image-only change was verified; `share-smoke`, `f2-smoke` and `rendition-smoke` passed.
3. **Site and Worker:** `ee08a4a`, run `40358104036` (success).

**End to end** (GM-TEST-01, synthetic media, temporarily PUBLIC, restored to DRAFT):

PASS:
- Intro processing on the new image.
- The share copy: the chosen frame first; every Intro frame one frame later; the audio shifted by one frame.
- The Worker serves the exact bytes.
- Discord Web shows the chosen frame before Play, and again after a frame change with a new URL. Playback, Open GamID and B1 work.
- Supersede, idempotency, the error paths and the hourly rate limit (tested in a rolled-back transaction).
- Replacing the Intro voids the selection; older URLs fall back to the current Intro.
- Removing the Intro: the copy is not served and the routes return 404.
- The sweep after the 10-minute grace.
- The quota exclusion (rolled-back probe).
- F8-B1: `rendition-smoke` passed, and the existing rendition stayed ready.

NOT TESTED by the agent:
- the signed-in editor picker on desktop and mobile;
- the Discord desktop app;
- Discord on a phone.

**Observed:** Mazen's own @black Intro got a share copy at 4.402 s during the session. It was left untouched.

**Fresh test links** in #clips-test: messages `1564317528258257007` (3.000 s) and `1564318351524761741` (1.500 s).

**Next:** Mazen's personal verification in GamID (desktop and mobile editor) and in Discord, then his acceptance decision.

GamID Truth: UPDATED. New capability `intro-discord-thumbnail` (PENDING_ACCEPTANCE, checkpoint `02c98c5`). `discord-share-card`: the media contract now describes the share-copy URL with its fallback; checkpoint `02c98c5`; notes updated.
## 138. Discord FINAL ACCEPTANCE + public Intro waits for Play (2026-10-27)

Mazen's task: "Final Discord Acceptance + Public Intro Manual Play".

**Part 1: final acceptance.**
- **What Mazen accepted:**
  - the Discord share card, with all B1 purple dividers;
  - the selected Intro frame before playback;
  - Play and manual playback in Discord, from the beginning with audio;
  - Open GamID and its destination;
  - the fallback and thumbnail updates.
- **Truth:** `discord-share-card` and `intro-discord-thumbnail` are ACCEPTED.
- **Unchanged:** the card and its behaviour.
- **Product Memory:** the acceptance review is proposed and not saved, because saving needs his separate approval.

**Part 2: the public Intro waits for Play.** Details: `docs/PUBLIC-INTRO-MANUAL-PLAY.md`.
- **Cause:** the player had called `play()` on load since `37812de` (2026-09-16). It was not a regression.
- **Product commits:** `4b0ac98` and `aefa2da`.
  - The first public presentation shows the owner's chosen thumbnail frame (else the first frame), paused in the existing full-screen player, with a centred "Play Intro" button and Skip.
  - Play starts from 0:00 with sound; Replay plays at once.
  - Lease renewal on a late Play, without a profile flash.
- **Deployed:** `aefa2da` by run `40370232675` (site and Worker only; no database, Worker-code, Cloud Run or Discord change).
- **Tests:** `npm run build` passed: 2,265 tests, 0 failures, 3 skipped.

**Live checks.**
- **PASS:**
  - Chromium with autoplay allowed, at desktop and phone sizes: all four Intro / Wall / Classic routes, Play, Skip before and during playback, the Intro end, Replay, and the 97 s lease renewal;
  - Mazen's own Chrome 156 as a returning visitor;
  - Android Chrome 154 in the emulator, with a real tap.
- **PARTIAL:** WebKit on Windows: no autoplay, but this build decodes no WebM, so the poster frame could not be checked.
- **NOT TESTED:** Firefox (it does not start here), real Safari on macOS / iOS, and physical phones.

**Next:** Mazen's personal verification of the public Intro, then his acceptance decision.

GamID Truth: UPDATED.
- `discord-share-card` and `intro-discord-thumbnail` are ACCEPTED.
- New capability `public-intro-manual-play` (PENDING_ACCEPTANCE, checkpoint `aefa2da`).
- `classic-profile-desktop` (desktop-preserves) and `public-profile-mobile-v2` (public-mobile-intro) now say the Intro starts only when the visitor presses Play.
- `intro-landscape-hint` names the Play button.

## 139. Production release authorized but BLOCKED (no Production environment); Social Lab Worker removed (2026-10-27)

Product Memory: REV-0029 and DEC-0012 saved with Mazen's approval (commit `be0f23e`).

Mazen's task: "Authorized Production Release + Legacy Social Lab Cleanup".
- **What he authorized:** the Production release of the Discord share card (B1), the Intro Discord Thumbnail and the public Intro manual play.
- **Acceptance:** he approved the final TESTING results, so Truth `public-intro-manual-play` is now ACCEPTED.

**Production: NOT released.** The verification found no GamID Production environment:
- Truth says `production: NOT_RELEASED`.
- The only GamID Supabase project is "GamID — TESTING" (`upvtrczefcvigxdyuylw`).
- The only active deployment workflow is `deploy-cloudflare-testing.yml`; `deploy-pages.yml` has been retired since 2026-10-07.
- The only site Worker is `gamid-testing-static`, and the Intro worker exists only as the Cloud Run `gamid-testing` jobs.
- No Production release procedure is documented.

A release would first need new infrastructure, which the task excludes:
- a Production Supabase project with every migration;
- a Production Worker and domain;
- Production Cloud Run worker and dispatcher;
- secrets and a release workflow.

It would also need a decision on what Production carries. The feature branch also holds other unmerged, partly unaccepted work, and `main` is far behind. Nothing was created, merged or deployed. This needs Mazen's separate decision.

**Social Lab** (`https://gamid-social-lab.gamid.workers.dev/p/labplayer`):
- **What serves it:** the separate Worker `gamid-social-lab` (Phase 0b lab, section 7x). It is a free-plan Worker with static assets only, no bindings or secrets, on `workers.dev` only. Its last deployment was version `0a1194f9` on 2026-10-26, which also served the Share Card and thumbnail labs.
- **Dependencies:** no runtime dependency. Only docs, Truth records, REV-0028 and code comments name it as provenance.
- **Removal:** independent, so safe to remove. Removing it means deleting that Worker (`npx wrangler@4.86.0 delete --name gamid-social-lab`, the removal documented in `social-lab/wrangler.jsonc`). The agent's attempt was refused by the session's permission check, so the page is **still live** (200).
- **Removed later the same day (2026-10-27)**, with Mazen's explicit authorization in a separate task:
  - **Identity reconfirmed first:** Worker `gamid-social-lab` on his Cloudflare account, latest version `0a1194f9`, only the `ASSETS` static-assets binding.
  - **Deletion:** `npx wrangler@4.86.0 delete --name gamid-social-lab` reported `Successfully deleted gamid-social-lab`.
  - **Verified:** `/p/labplayer` and `/` on `gamid-social-lab.gamid.workers.dev` return 404, and the Cloudflare API reports that the Worker does not exist (code 10007).
  - **Unaffected:** `gamid-testing-static` still serves `/` (200), `/@black` (200, with its Discord card and the chosen-frame `intro-discord.webm`) and `/@black/intro.webm` (206).
  - **Nothing else changed:** no other Worker, database, bucket or Supabase project. The repository `social-lab/` folder remains as history.
- **Kept:** the repository `social-lab/` folder stays as history. No other Worker or resource is touched.

GamID Truth: UPDATED.
- `public-intro-manual-play` is ACCEPTED.
- The notes of the three capabilities record the authorized-but-not-performed Production release.
- `production` stays NOT_RELEASED.
## 140. Infrastructure Optimization & Security Hardening V1 (2026-10-27)

Mazen's task: "GAMID — Infrastructure Optimization & Security Hardening V1". TESTING only. Record: `docs/INFRA-OPTIMIZATION-V1.md`.

- **Product:** `bcbdc7d75a26e3750a90db069f9f71a9ab4f5741` on `feature/discord-share-card-v2`, not merged.
- **Migrations:** `20261027120000_intro_posters` and `20261027120100_cron_log_retention`, both APPLIED on TESTING (transaction, then `migration repair`).
- **Site and Worker:** deployed by run `40507974877` (success).
- **Public Intro still poster:**
  - The queue, bucket, policy, lookup, worker module, player poster mode, dispatcher allowlist and image files are all in place.
  - **Inert for every real account** until Mazen deploys the worker image and dispatcher with `worker/cloud-run/deploy-intro-poster-testing.sh`.
  - Existing Intros additionally need the separately authorized `worker/cloud-run/intro-poster-backfill.sql`.
  - Validated end to end on GM-TEST-01: a synthetic Intro, with posters generated by the same worker code and completed through the real RPCs. The fixture was made PUBLIC temporarily and restored to DRAFT; it keeps the synthetic Intro.
  - Results: 33.8 KB before Play instead of 1.16–1.22 MB; 0 video bytes before Play; Play from 0:00 unmuted; Skip, Replay and routing unchanged.
  - Same frame: 46.8 dB on desktop, 32.9 dB on phone (Chrome's image-vs-video scaling filter, not visible at 2× zoom; for Mazen's visual acceptance).
- **Media route hardening (live):**
  - single byte range, else 416;
  - HEAD cancels the body;
  - Workers Rate Limiting at 120 / 1,200 (Discordbot) / 300 page per minute; 429 verified live.
- **pg_cron retention (live):** daily, 7 days. Run once: 38,118 rows went to 10,080. Both jobs are active.
- **Regression:** @black, read-only, is unchanged: no poster, the same seek and the same bytes, with the Discord card and `og:video` present. `npm run build`: 2,279+ tests, 0 failures.
- **GamID Truth:** new `public-intro-poster` and `public-media-route-protection`, both PENDING_ACCEPTANCE.
  - The accepted `public-intro-manual-play-poster` wording "not a separate image" is kept: it stays true until posters are activated.
  - The new contract says it supersedes that wording for Intros with a ready poster once accepted.
- **Product Memory:** REV-0030, ISS-0018 and ISS-0019 saved with Mazen's approval.
- **Not done or not authorized:**
  - Production;
  - merging;
  - R2;
  - paid services;
  - zone caching / WAF;
  - sticker re-encoding;
  - Wall lease, picture-copy and stable-Intro-URL contract changes.

## 141. Intro poster acceptance gate (GM-TEST-01 only) before the worker deployment (2026-10-27)

Mazen's request: before the Intro Poster Worker is deployed, restrict automatic poster generation to GM-TEST-01 during the acceptance phase. No real account may receive a poster before his visual acceptance. Record: `docs/INFRA-OPTIMIZATION-V1.md` §1, "Acceptance gate".

- **Why it was needed:** the worker deployment alone would have started posters for any account that activated a new Intro or chose a new frame. The deployment instructions were held back until the gate was in place.
- **Product:** `5ddb18c5ce6cb124ff6be4899d020bcb6669208a`: migration `20261027140000_intro_poster_activation_gate` and tests. No site, Worker or worker-image change.
- **Migration:** rehearsed on TESTING in a rolled-back transaction (11 of 11 checks), then APPLIED (transaction, then `migration repair`).
- **What the gate does:** `private.intro_poster_activation` holds GM-TEST-01 alone; the migration aborts unless exactly one profile matches. It is enforced at four points:
  - **queueing:** `enqueue_intro_posters` queues nothing for any other profile (the trigger and the backfill both go through it);
  - **claiming:** the worker never claims another profile's poster, and supersedes any such pending or processing row with `INTRO_POSTER_NOT_ACTIVATED`;
  - **completing:** `worker_complete_intro_poster` refuses with `INTRO_POSTER_NOT_ACTIVATED`;
  - **serving:** the lookup and the storage read policy return no poster for any other profile. The lookup's frame (`poster_ms`) is unchanged, so the page keeps seeking the video exactly as `public-intro-manual-play-poster`.
- **Rehearsal checks:**
  - simulating the backfill over every active Intro (3 non-fixture) queued 0 rows for them;
  - with the fixture deactivated, standing in for a real account: the same frame and no poster, the storage predicate false, the trigger queued nothing, completion was refused, and an in-flight row was not claimed but superseded.
- **Worker processing on the fixture (real worker code, run locally against TESTING through the gated RPCs; the Cloud Run image is not deployed):**
  - frame 2000 → 1000 ms: one poster queued, claimed, generated (32,664 bytes, 1280×720, q90) and completed; the 2000 ms poster superseded;
  - frame restored to 2000 ms: a new poster generated, byte-identical to the earlier one (33,804 bytes);
  - the queue was then empty.
- **Visitor check (fixture PUBLIC temporarily, restored to DRAFT):**
  - desktop and mobile: 33.8 KB poster and 0 video bytes before Play;
  - Play from 0.005 s, unmuted, with audio;
  - Replay plays at once; Skip downloads 0 video bytes; the Intro ends on the profile;
  - a repeat visit downloads 0 bytes before Play;
  - same frame: 46.8 dB desktop, 32.9 dB mobile, as in §140.
- **Real accounts:** 0 poster rows and 0 poster objects outside the fixture. Anonymous lookups for @black (4402 ms) and @zshot return no poster.
- **Tests:** `npm test` 2,284 tests, 0 failures.
- **GamID Truth:** `public-intro-poster` stays PENDING_ACCEPTANCE; it gains the gate in its `public-intro-poster-image` contract, the limit `activatedProfilesDuringAcceptance: 1`, and checkpoint `5ddb18c`.
- **Next (Mazen):**
  1. Deploy the worker with `worker/cloud-run/deploy-intro-poster-testing.sh` at this checkpoint or later.
  2. Do the visual acceptance on GM-TEST-01.
  3. Lifting the gate (a later migration) and the backfill each need his separate approval.

## 142. Intro poster worker deployed to TESTING; post-deployment E2E on GM-TEST-01 (2026-10-28)

- **Deployment (Mazen, Cloud Shell, 2026-10-28):**
  - `worker/cloud-run/deploy-intro-poster-testing.sh` from `7c9b891ad2434139f200cdcf56a7fa753bb902df`;
  - he reported `INTRO_POSTER_TESTING_WORKER_AND_DISPATCHER_DEPLOYED`, the rendition smoke `ok=true` and a successful Job execution.
  - The agent has no Cloud Logging access. The worker's success is shown by the database and storage results below and by the dispatcher's HTTP responses (`net._http_response`).
- **Automatic generation by the real dispatcher and Cloud Run worker (no local worker):**
  - Fixture frame 2000 → 1000 ms: the dispatcher answered 202 `{"accepted":true}`. The poster was ready 17 s after queueing, on 1 attempt with no failure (32,664 bytes, the same bytes as the local run in §141).
  - Restored to 2000 ms: dispatcher 202; ready after 10 s, on 1 attempt (33,804 bytes, the same as before).
  - The worker's storage sweep had already deleted the older superseded poster objects. Queue empty afterwards.
- **Visitor E2E (fixture PUBLIC temporarily, restored to DRAFT):**

  | Check | Desktop | Mobile |
  |---|---|---|
  | Bytes before Play | 33.8 KB poster, 0 video bytes | 33.8 KB poster, 0 video bytes |
  | Earlier seek mode, for comparison | 1.18 MB of video | 1.16 MB of video |
  | Same frame | 46.8 dB | 32.9 dB (as in §140) |
  | Play | starts at 0.009 s, unmuted, audio decoded | starts at 0.013 s, the same |
  | Replay | immediate, no poster | the same |
  | Skip | 0 video bytes | the same |
  | Intro ends on | the profile | the same |
  | Repeat visit, before Play | 0 bytes | 0 bytes |

- **Real accounts (anonymous, read-only):**
  - @black: lookup frame 4402 ms, no poster; `og:video` and the card metadata present;
  - @zshot: no poster; page metadata present;
  - 0 poster rows and 0 poster objects outside the fixture; the gate still lists only GM-TEST-01.
- **Final fixture state:** DRAFT, frame 2000 ms, two ready posters (0 and 2000 ms).
- **GamID Truth:** the `public-intro-poster` notes record the deployment. It stays PENDING_ACCEPTANCE; checkpoint `5ddb18c` is unchanged.
- **Not done:** backfill, lifting the gate, Production, acceptance.

## 143. Real Intro poster review on @black: gate extended, frame-rule fix (2026-10-28)

Mazen's authorization: a controlled visual test on his real TESTING profile @black, because the synthetic fixture cannot show visual quality. TESTING only.

- **Gate:** migration `20261028100000_intro_poster_gate_black_review`, rehearsed in a rolled-back transaction, then APPLIED.
  - It adds @black (exactly one profile, or the migration aborts) and queues posters for @black's current Intro only.
  - Activated profiles: GM-TEST-01 and @black. Other accounts: 0 poster rows and 0 poster objects.
- **The deployed worker (`7c9b891`) generated both posters automatically:** dispatcher 202 twice; ready in 15–16 s at 1920×1080. First frame: 548,564 bytes. Chosen frame (4402 ms): 161,386 bytes.
- **Defect found: the poster frame was one frame late.**
  - The 4402 ms poster showed frame 132 (presentation time 4.407 s); Chrome's paused video shows frame 131 (4.374 s). Screen PSNR was about 20 dB.
  - @black's derivative starts its video at 0.007 s (Opus pre-skip), and the worker counted time from the first frame.
  - A Chrome lab on the same file shows Chrome uses the media timeline itself: the last frame with presentation time ≤ currentTime (4.373 → 4.340, 4.374 → 4.374, 4.406 → 4.374, 4.407 → 4.407), and the first frame before it. The synthetic fixture's first frame is at 0, which is why the earlier E2E could not show this.
- **Fix:** `posterPlan` in `worker/intro-poster.mjs` (product `8895ed0`), with unit tests.
  - Checked on @black's real derivative against Chrome's paused frame at native 1920×1080: 0 ms 40.9 dB, 1000 ms 44.6 dB, 4402 ms 41.0 dB (frame 131), 7777 ms 42.1 dB; at most 0.017% of pixels off by more than 12.
  - **Not active** until the worker image is redeployed from `8895ed0` or later (Mazen, Cloud Shell).
- **Interim, @black stays in the gate:** its wrong 4402 ms poster was superseded (`POSTER_WRONG_FRAME_PRE_FIX`), so the page waits on the paused video exactly as before. Its first-frame poster (correct) stays ready but is not shown, because the page uses the chosen frame.
- **Behaviour checks on @black, desktop and mobile, with the wrong-frame poster:**
  - 161 KB poster and 0 video bytes before Play (seek mode: 1.79 MB);
  - Play from 0:00, unmuted, audio decoded;
  - Replay immediate; Skip 0 video bytes;
  - the Intro ends on the published Wall;
  - a repeat visit downloads 0 bytes before Play.
- **@black untouched:** before/after snapshot identical for visibility, Intro settings, active job, share copies, Wall publication and Intro media objects. Only poster rows were added.
- **Rollback:** `worker/cloud-run/intro-poster-gate-black-rollback.sql`, rehearsed in a rolled-back transaction. @black leaves the gate, its posters are superseded, the lookup returns frame 4402 with no poster, and its settings hash is unchanged.
- **Related finding, not changed:** the accepted Discord share copy uses the same relative frame rule (`worker/intro-share.mjs`). @black's share copy starts on frame 132 (50.4 dB match), one frame (33 ms) after the frame Chrome shows. A Product Memory issue was proposed to Mazen.
- **GamID Truth:** `public-intro-poster` stays PENDING_ACCEPTANCE: `activatedProfilesDuringAcceptance` 2, the frame-rule wording, checkpoint `8895ed0`, notes.
- **Next:**
  1. Mazen redeploys the worker from `8895ed0` or later.
  2. Re-queue @black's chosen-frame poster (`private.enqueue_intro_posters`), verify, then Mazen's visual review.

## 144. @black poster validated on the corrected worker; ISS-0020 share-copy fix (2026-10-28)

Mazen's task: "Finish Intro Poster Validation & Discord Frame Bug". TESTING only.

- **Corrected worker:** Mazen redeployed it from `1449bbc` (the frame rule of `8895ed0`) and reported DEPLOYED with all smokes passed.
  - `private.enqueue_intro_posters(@black)` queued 1 poster (4402 ms); none of @black's settings changed.
  - The dispatcher answered 202; the Cloud Run worker had it ready in 18 s, on 1 attempt, at 1920×1080.
  - The poster is 208,466 bytes, byte-identical to the corrected code's local output for frame 131. The old worker's frame-132 poster was 161,386 bytes. This shows the deployed image has the corrected rule.
- **@black E2E** (anonymous browser; desktop 1440×900, mobile Pixel 7):

  | Check | Desktop | Mobile |
  |---|---|---|
  | Bytes before Play | 208.5 KB poster, 0 video bytes | 208.5 KB poster, 0 video bytes |
  | Earlier seek mode, for comparison | 1.78 MB of video | 1.66 MB of video |
  | Same frame: whole screen | 44.0 dB (0.002% of pixels off by more than 12) | 32.7 dB |
  | Same frame: Intro area | 43.5 dB | 27.4 dB |
  | Same box | yes | yes |
  | Play | starts at 0.010 s, unmuted, audio decoded | starts at 0.011 s, the same |
  | Replay | immediate, no poster | the same |
  | Skip | 0 video bytes | the same |
  | Intro ends on | the published Wall | the published Wall |
  | Repeat visit, before Play | 0 bytes | 0 bytes |

  - **Phone difference:** Chrome's image vs video downscale filters, larger on this detailed content than on the fixture. At 3× zoom it is the same frame and composition; the poster's fine edges are slightly softer. For Mazen's judgement.
- **@black untouched:** before/after snapshot identical for visibility, Intro settings, chosen frame, active job, share copies, Wall publication and Intro media objects. Poster rows: 3 (one superseded, the wrong pre-fix frame).
- **Gate:** activated GM-TEST-01 and @black only. Outside them, 0 poster rows and 0 objects. @zshot: no poster.
- **Discord:** @black's and @zshot's card metadata (`og:video`, `og:image`) present for Discordbot; @black's `/intro-discord.webm` HEAD 200 (6,205,647 bytes, unchanged).
- **ISS-0020 (saved with Mazen's approval; AUTHORIZED): share-copy fix `e52de5a`.**
  - **What changed:** `sharePlan` in `worker/intro-share.mjs` now uses the same media-timeline rule as the poster.
  - **Regression tests:** a non-zero first frame, an exact frame boundary, one millisecond before it, before the first frame, and @black's real timestamps.
  - **Local check on @black's derivative (nothing uploaded):** the first frame is frame 131 (46.8 dB; 19.1 dB against frame 132), and `validateShare` passes. The rest of the Intro equals the accepted copy: 44.47 vs 44.52 dB against the derivative, 332 frames each, duration 11.049 s.
  - **Not active** until the worker image is redeployed from `e52de5a` or later.
  - Existing share copies, @black's included, are not replaced without Mazen's separate approval.
- **Tests:** `npm test` 2,285 tests, 0 failures; Product Memory validation passed (68 records).
- **GamID Truth:** `public-intro-poster` notes record the redeployment; the bug sentence added in §143 was removed (bugs belong to Product Memory). It stays PENDING_ACCEPTANCE, checkpoint `8895ed0`. `intro-discord-thumbnail` unchanged until the share-copy fix is deployed.
- **Review state:** @black and GM-TEST-01 are activated and PUBLIC for Mazen's review. GM-TEST-01 stays PUBLIC until he closes that review.
