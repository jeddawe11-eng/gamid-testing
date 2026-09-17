# GamID — Authoritative Technical Continuation Handoff

Last updated: 2026-09-18

Repository: `jeddawe11-eng/gamid-testing`

Branch: `main`

Authoritative implementation checkpoint: `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (Split Reveal Intro-visibility fix, TESTING-deployed and manually accepted by Mazen; applied on top of the Slice 3C implementation checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`, which remains the latest substantive Slice 3C backend/timer checkpoint — see section 7a)

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

Equivalent applied Slice 3C remote records are `20260916101711`, `20260916101805`, `20260916102030`, and dispatch activation record `20260916150139`. Do not rerun or duplicate them.

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

Current exact implementation checkpoint: `d7466f99e6f5398c5c0e83c029f1d09715c1321f` (Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43` plus the accepted Split Reveal Intro-visibility fix in section 7a).

Slice 3C exists. Do not restart it. Its backend E2E succeeded and latest automated validation passed. The Split Reveal transition defect within Slice 3C's Full Preview feature is now fixed and manually accepted by Mazen (section 7a), but this does not close Slice 3C as a whole — formal acceptance of the rest of Slice 3C was not given, and Mazen intentionally deferred the remaining manual Slice 3C testing/fixes listed in section 9. Do not automatically continue them.

Do not start the next implementation slice. First inspect the repository read-only, then discuss the roadmap and next priority with Mazen. Proceed only after he explicitly chooses and authorizes the next work.
