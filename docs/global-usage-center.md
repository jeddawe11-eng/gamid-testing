# Global Usage Center — TESTING

Current authoritative limits and status: `gamid-truth.json` (capability `global-usage`).

Starting checkpoint: `afef865a8868d5677f51b521d2c8f2e0e6a9048d`.
Branch: `feature/global-usage-center`. No main merge or Production access.

## Account contract

`get_my_usage()` is an authenticated owner RPC with no owner argument. It returns
a versioned storage summary, media categories and an extensible quota array.
200 MB means **200,000,000 bytes**, consistently in the backend and UI. Existing
per-file MiB limits remain unchanged.

The private accounting functions read actual Storage object sizes, once per
physical object. Registry rows, references, external embeds and ordinary database
rows do not consume this allowance. Both retained sources and derivatives count.
Old avatars or failed files count while they physically remain; no real-user
backfill, deletion or replacement cleanup is run by this migration. Files removed
through supported Storage APIs disappear from the next authoritative snapshot.
Missing size metadata fails closed rather than silently undercounting.

Existing media uses UUID owner folders. The supported gateway requires this
convention for every new object. Categories are configured in a private bucket
mapping; unknown future owner buckets count under Other. Adding a writable bucket
requires its server-side allowlist and ownership/type policy, not a new UI engine.

## Authoritative feature limits

- Personal Wall: 60 registered assets shared by images and videos; 15 videos
  (raised from 10 by migration `20261005025319_wall_video_limit_15`).
  Accepted numeric constants are centralized in private functions used by the
  existing validators and Usage. Images have no separate numeric allowance.
- Personal Wall layers/stages have no numeric product cap. Usage shows the saved
  layer count without inventing `/10`. The existing document byte limit remains.
- Owned Crews: 15 ACTIVE members and 2 Crew Wall stages, from the existing private
  Crew policy and stage allowance function. Each owned Crew has its own rows.
- Displayed Wall counts reflect saved documents and registered assets. Upload
  reservations are displayed separately from retained bytes.

## Shared UI and synchronization

The accepted authenticated shell mounts Usage immediately before Notifications.
Both mount immediately; a slow Usage read cannot delay the bell. There is one
private Notifications connection with an additional data-free `usage_changed`
event. Notification producers, unread RPCs, mark-read logic and topics are reused
unchanged. No Usage polling or independent owner session is introduced.

Entry-graph audit covers Account (Identity, Games, Connections, privacy/publishing,
sharing, My Crew and My Duo), Wall Editor (Wall/Templates), Play Together (Team
Room), and Crew management/owner preview. Public visitor pages and embedded
renderers do not mount private owner controls. Future authenticated entry graphs
inherit the existing shell. Owner changes and pagehide discard both controls.

## Supported upload gateway

`usage-upload` custom-authenticates with Auth user validation, or a service-only
probe for the existing backend worker. It is pinned to TESTING project
`upvtrczefcvigxdyuylw`. No upstream URL, service key or receipt row reaches clients.

An advisory lock serializes reservations for each owner. New capacity must fit
actual retained bytes plus unresolved reservations plus the proposed upload.
Reservations are idempotent for one owner/bucket/path/size/type. Committed objects
are excluded from reserved bytes to avoid double counting. Standard upload bytes
are measured from the bounded request body; resumable uploads bind Upload-Length
and fixed metadata, enforce chunk/offset bounds, and verify the actual completed
Storage metadata size before success.

The browser and derivative worker reuse the existing resumable engine with 6 MiB
chunks. The worker reads one file range at a time. OAuth, voice, media encoding,
dimensions, registered-asset limits and existing source cleanup semantics remain.

Uncertain failures retain reservations. The client requests supported TUS
termination after exhausted retries. A reservation is released only after
confirmed remote termination/absence and actual object absence; elapsed time
alone never frees capacity. Owner-driven reconciliation checks abandoned uploads
after 26 hours (past the upstream 24-hour expiry). Upload operations stop using
unresolved receipts after 24 hours. Confirmed retained bytes remain charged until
actual deletion. The UI shows reserved versus used bytes distinctly.

Service-created objects have no normal Storage owner_id. A private COMPLETE
receipt supplies narrowly scoped owner read/delete/RPC validation alongside the
accepted legacy owner_id rules. Restrictive INSERT/UPDATE policies prevent clients
from bypassing the gateway when activated. Storage schema objects and physical
files are never manually mutated; no custom Storage trigger is installed.

## Rollout gates

The migration starts with `gateway_required=false`. This is an explicit rollout
gate, not a claim that aggregate enforcement is active. (Current state: the gate
is enabled on TESTING - enforcement is ON; see `gamid-truth.json`.) Apply the migration,
deploy usage-upload and wall-asset-register, rebuild the existing TESTING worker,
then deploy the matching frontend. Verify fixture uploads, deletion and quota
rejection before enabling the gate. Never enable it while a browser/worker path
still uses an incompatible upload mechanism.

Cloud Build uses **repository-root** context and the source allowlist in
`worker/cloud-run/usage-testing.gcloudignore`. Existing image repository:
`asia-southeast1-docker.pkg.dev/gamid-testing/gamid-workers/intro-processing`.
Existing Cloud Run Job: `gamid-intro-worker-testing`, region `asia-southeast1`.
Update its image only; preserve secrets, service account, resources and command.
No new dispatcher, scheduler, secret or resource is needed. The unchanged
dispatcher invokes the existing Job.

`node intro-worker.mjs usage-smoke` deliberately never claims real processing
jobs. It reserves 200 MB for a random disposable fixture owner, proves the next
byte is refused, cancels those non-uploaded reservations, uploads four disposable
bytes through the derivative gateway, verifies actual read size and deletes only
that fixture object. It also races two 150 MB reservations (exactly one may
succeed), creates two disposable Auth identities, verifies owner/cross-owner
uploads, retry accounting and deletion reclamation, and removes those identities.
The fixture generates a one-second HEVC source, runs the accepted Intro VP9 and
Wall H.264 encoders, and verifies stored source/derivative totals. Owner image,
MP4 and WebM gateway paths are exercised too. No real queued processing job is
claimed. `usage-smoke-enforced` additionally requires activation and rejects direct
authenticated Storage and TUS attempts.

Existing ordinary TUS PATCH requests recheck upload permission. Previously issued
signed-upload capabilities or a request already in flight at cutover need an
expiry/drain window before claiming complete exclusion of every legacy path.
Do not rotate credentials or mutate real-user uploads to shorten that window.
Historical October 5 cutover requirement: the then-active Pages handoff also had to serve compatible client files. It is superseded by the Cloudflare authentication migration (docs/CLOUDFLARE-AUTH-MIGRATION.md); current Cloudflare flows do not depend on Pages.
On October 5, the approved exact `feature/global-usage-center` environment rule
was added, retaining existing rules, and both TESTING origins served matching
gateway clients. Read-only Storage logs contained no signed-upload requests in
the preceding 24 hours; there were no active gateway receipts for registered
users before activation verification. Recheck these conditions at a new cutover.

Real Edge transport regressions are covered: empty creation body streams,
PostgREST void RPC HTTP 204 responses, and Edge internal request URLs omitting
the public `/functions/v1` prefix. Upload Location uses the fixed public TESTING
gateway route, never a caller-controlled or internal origin.

## Verification

Local Postgres tests execute the actual migration against isolated fixture
schemas, including RLS and function grants. They do not modify Supabase Storage
metadata. Gateway tests cover actual measured bytes, quota rejection before
Storage writes, cross-owner requests, opaque resumable URLs, fixed lengths,
termination, failure reservations, expiry cleanup and service authentication.
Shared UI tests cover lifecycle, no delayed bell, shared subscription routing,
public exclusion and failure recovery. Existing media tests follow the new
gateway boundary while retaining encoding/resolution/cleanup assertions.

Run `npm ci && npm run build`. A read-only local header fixture is available with
`node prototypes/global-usage-lab/server.mjs` at `http://127.0.0.1:4242/`.
It uses the real shared shell, Usage/Notifications components and accepted page
headers/styles with fixture data and `connect-src 'none'`; no real user is touched.

## Manual acceptance after deployment

1. Sign in on shared TESTING. Check Usage beside the bell on Account, Wall Editor /
   Templates, Play Together / Team Room and Crew management. Account sections
   Identity, Games, Connections, My Crew and My Duo use this same shell.
2. Open Usage at desktop/mobile widths. Compare stored totals and category sums.
   Verify layers have no invented limit and assets/videos show 60/15.
3. On a disposable account upload an avatar, Wall image and MP4/WebM; observe
   usage updates. Remove the Wall assets and verify actual retained bytes fall.
4. Process an Intro and a converted Wall video on the fixture account. Check
   retained source/derivative accounting and confirmed source cleanup.
5. Using fixture media approach 200 MB. The next over-limit upload must be refused
   without changing existing media; text/settings/session features still work.
6. Verify notification unread count and Mark Read / Mark All Read, navigate across
   authenticated surfaces and confirm one consistent log. Sign out; both controls
   disappear. Public visitor GamIDs must not show Usage.

USAGE remains subject to Mazen's manual acceptance.
