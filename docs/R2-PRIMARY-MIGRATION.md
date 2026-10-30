# R2 Primary for video - migration plan (TESTING, phase 1)

Status: **PHASE 1 COMPLETE (analysis + empirical probe). Nothing is implemented, applied or deployed for R2 Primary.**
Direction approved by Mazen on 2026-10-30, implementation and tests authorized on TESTING only. This is not acceptance and not a Production authorization.
The Architecture F pilot (DEC-0013, `PROJECT_HANDOFF.md` §148-§149) stays in place, switched OFF, until the replacement is proven.

Bounds (Mazen, 2026-10-30):
- R2 is the primary store for permanent video files.
- The Supabase database keeps accounts, auth, permissions, file metadata and quota.
- No second permanent video copy in Supabase Storage for delivery.
- Temporary storage during processing is allowed, but it must be cleaned and never become permanent.
- Images, fonts and non-video files stay as they are.
- No automatic restore between R2 and Supabase when a file is lost outside GamID.
- A user-initiated delete or replace reaches the real file and its dependent records.

## 1. Dependency inventory (what reads or writes video in Supabase Storage today)

Full code map: research note `gamid_codebase_impact.md`, summarized here. Each row says what has to change for R2 Primary.

| Area | Today | Under R2 Primary |
|---|---|---|
| Owner upload | client TUS -> `usage-upload` gateway (`reserve_usage_upload`, then a TUS proxy to Supabase, then `usage_upload_action` complete) for `intro-sources`, `wall-video` | **kept as the temporary landing zone** (section 3); promotion to R2 is new |
| Worker counted writes | gateway TUS: `intro-media` (D3), `wall-video-derived` (HEVC) | ingest PUT to R2 + registry row (counted) |
| Worker uncounted writes | direct service TUS: `wall-video-renditions`, `intro-share-copies`; `intro-posters` POST | renditions + share copies -> R2 (registry, uncounted); **posters stay on Supabase** (images) |
| Worker reads | `/storage/v1/object/authenticated/...` for `intro-sources`, `intro-media` (poster, share, replica), `wall-video` (HEVC, rendition) | landing-zone reads unchanged; reads of promoted objects through a new signed ingest GET |
| Existence and size proofs | `storage.objects` in about 30 SQL functions: quota, reserve/complete/cancel, `authorize_usage_delete`, `queue_my_intro_impl`, every `worker_complete_*`, `register_verified_wall_asset_impl`, rendition creation, the pilot enqueue and delivery | registry row `state = 'stored'` for promoted objects; `storage.objects` only for the landing zone |
| Quota / Global Usage | `usage_stored_bytes`, `usage_reserved_bytes`, `get_my_usage_impl` sum `storage.objects` (minus renditions, share copies, posters) | the same sums **plus** counted registry rows, each logical file counted once (section 4) |
| Visitor leases | `public-media`: `public_media_lease_allowed`, then a Supabase signed URL (Intro 120 s, Wall 6 h); R2 branch for `intro-media` only | the same predicate, then a Worker HMAC lease for every promoted video (pilot `signMediaR2Url` / `verifyDelivery`) |
| Owner preview | `signIntroMedia`, `signWallVideo`, `loadIntroMedia`, `loadWallAsset` sign Supabase with the owner JWT | a new owner lease (same HMAC, owner check in Postgres) for promoted objects |
| Crawler routes | `/@h/intro.webm`, `/@h/intro-discord.webm`: anon passthrough via storage RLS; R2 when the delivery decision says `r2` | the delivery decision answers `r2` for promoted objects without the pilot allow-list or fallback budget |
| Client acceptance | `publicMediaLease` and `intro-source.js` accept an R2 lease for `intro-media` only; F6-A cache `BUCKETS` (`published-video-url-cache.js:19`) knows Supabase buckets only | widen to the Wall buckets and Worker URLs |
| Storage-driven sweeps | renditions, share copies, posters, Wall orphans scan `storage.objects` | registry-driven sweeps for promoted objects; storage-driven sweeps stay for the landing zone and posters |
| Row-driven cleanup | Intro source/derivative (`*_cleanup_eligible_at`), HEVC sources, R2 replicas | unchanged marking; physical delete of promoted objects goes to R2 through the registry |
| Storage RLS | owner read by folder/receipt, anon read predicates, sign ban, gateway write policies | unchanged for the landing zone; promoted objects are reachable only through Worker-verified HMAC |
| Worker / Cloud Run | one Job image, priority order D3 -> cleanup -> poster -> share -> HEVC -> rendition -> replica; pg_net dispatch | the same order, plus a promote step and a registry delete step; the Job holds only the ingest key (no R2 credential) |

**Not affected:** avatars, banners, `wall-media` images, `wall-fonts`, `intro-posters`. FFmpeg settings (D3 VP9 CRF 40, H.264 CRF 20/23 `+faststart`, the VMAF gate) and the client F8-A remux are storage-agnostic.

## 2. Empirical probe: what the Worker + R2 really enforce (2026-10-30)

**Method.** Run against the deployed TESTING Worker's existing ingest route (`PUT/DELETE /media/v1-ingest/<key>`, HMAC ingest key, R2 SHA-256 check, 15 MiB cap), with no code or infrastructure change.
- Keys were synthetic, under `intro-media/r2-primary-probe/<GM-TEST-01 owner>/<uuid>`, with random-byte bodies.
- Every object was deleted afterwards and checked absent with `wrangler r2 object get` (exit code).
- The GM-TEST-01 pilot replica was not touched.

| Case | Result | What it proves |
|---|---|---|
| T1 correct Content-Length (1 MiB) | 200, size 1,048,576, SHA matches | baseline |
| T2 declared CL 512 KiB, body 1 MiB, SHA of the prefix | 200, **stored 524,288 bytes** | the Worker never sees more than the declared length; extra bytes are discarded |
| T3 the same, SHA of the whole body | 502 `R2_PUT_FAILED` | R2's digest check refuses truncated content |
| T4 declared CL 2 MiB, body 1 MiB | timeout (curl 000), **nothing stored** | a short body never becomes an object |
| T5 chunked body, no client Content-Length | the Worker received `content-length: 1048576` (the signature over 1,048,576 matched; over `""`/`0` it was 401); 200, stored 1 MiB | the edge gives the Worker the real body length even for a chunked upload |
| T6 wrong SHA-256 | 502, nothing stored | R2 enforces the digest |
| T7 16 MiB + 1 | 400 `INVALID_REPLICA` (handler cap, before the body is read) | handler size caps work from the header |
| T8 101 MB body | **413 from Cloudflare** before the Worker | the platform request-body limit is 100 MB on this account |
| Cleanup | every key deleted and verified absent | signed DELETE works; existence is checkable with wrangler |

**Conclusions.**
- In the Worker, `Content-Length` equals the bytes that `request.body` delivers: it is never exceeded, a short body fails, and the edge sets it for chunked uploads.
- A size cap checked in the Worker from the header, plus a `stored.size` check after `put`, is therefore a sound guard.
- A single request is limited to 100 MB, so any file over about 95 MB (the `wall-video-derived` cap is 200 MiB) needs R2 multipart through the binding (parts at most 100 MB).
- Presigned R2 URLs remain unsuitable for quota-safe uploads: no POST policy, signed Content-Length enforcement unconfirmed, and they need new R2 S3 credentials. Not used.
- **Not measured yet (phase 2):** Worker CPU time and duration for a 50 MiB streamed PUT, and a multipart upload through the binding. The ingest route caps at 15 MiB, so both need the phase 2 route.

## 3. Upload design: Supabase landing zone, then verified promotion to R2

**Recommended.** Owner uploads keep today's proven path unchanged, and Supabase Storage holds them only temporarily:
- TUS through the `usage-upload` gateway;
- quota reservation under the existing lock;
- the per-bucket size and MIME caps;
- `complete` checking the stored size.

The Cloud Run Job then promotes the file to R2:
1. read it from the landing bucket;
2. take its SHA-256;
3. send a signed PUT through the Worker (R2 verifies the digest; size checked) — multipart for anything over 95 MB;
4. a registry row goes to `stored` in the same transaction that queues the landing object's deletion;
5. the landing object is deleted.

**Why this instead of a browser-to-Worker upload:**
- The 200 MB quota keeps today's tested enforcement (section 4).
- No new upload protocol: TUS resumability and the 6 MiB chunks stay.
- No new secret or credential.
- The derivatives the worker produces (D3, HEVC derivative, renditions, share copies) go to R2 directly through the ingest route; only owner uploads pass through the landing zone.

**Cost of the choice:**
- a few minutes in which the file exists only in Supabase (it is served from there exactly as today);
- one service read per upload (at most 50 MiB).

The landing object is temporary by construction:
- it is deleted after promotion;
- a failed promotion is retried by the Job, then the landing object is deleted as failed after a bound;
- it is never a delivery source once the registry row is `stored`.

**Alternative (deferred):** browser-direct multipart through the Worker with a gateway-issued HMAC upload ticket.
- The ticket carries owner, key, exact reserved bytes and part size; the Worker refuses any part whose `content-length` differs from the expected part size and checks the final size on complete.
- The probe shows the Worker can enforce this.
- It removes the landing read, but rebuilds resumability and needs a new protocol. Consider it only if the landing zone proves costly.

## 4. Quota (200,000,000 bytes) on database data that can't be bypassed

- **Registry** `private.media_objects`, a new table: `id`, `owner_id`, `logical_bucket`, `logical_path`, `r2_key` (unique), `bytes` (from R2's verified `put` result), `sha256`, `counted`, `category`, `state` (`stored` / `deleting` / `deleted` / `failed`), `source_upload_id`, timestamps, `delete_attempts`, `last_error`.
  - Writable only by security-definer functions; no client role and no direct table grant.
- **Stored bytes** = `storage.objects` sizes (as today, landing zone included) + counted registry rows in `stored` or `deleting`.
  - Each logical file is counted once: a landing object whose promoted row reached `stored` is excluded.
  - **As implemented (step 1, §151):** a deleted or replaced file stops counting at the commit of its delete, the same moment it stops being served.
    - Only `stored` rows count; this replaces the earlier draft rule "freed when the physical delete is confirmed".
    - Why: a replace counts the old and the new Intro only until the replace commits, and the user sees the space freed when the file is gone for them.
    - Physical removal is a guaranteed, retried queue (section 5); an exhausted one is listed for the operator.
    - Bound: R2 can briefly hold more than the user's counted bytes until the queue runs.
- **Reservations, parallel uploads and oversize** are unchanged: `reserve_usage_upload` still decides under its lock with stored + reserved + n <= quota, so parallel uploads are serialized. Per-file caps still come from `storage.buckets` for the landing buckets.
  - Promotion and derivative writes never exceed the reservation, because the registry bytes are the verified size of an object whose landing copy had already passed `complete`, or a derivative capped by its own bucket constant in the ingest route.
- **Failed or partial uploads:** exactly as today, through the receipts and their 900 s grace. A failed promotion keeps the landing object counted until it is cleaned, so space never disappears.
- **Counted / uncounted** follows DEC-0013's rule as a flag instead of bucket exclusions:
  - counted: `intro-media` and `wall-video-derived` derivatives, promoted `wall-video` originals;
  - uncounted: renditions and share copies.
- **Global Usage breakdown:** `get_my_usage_impl` adds registry rows by category; the totals shown stay identical.

## 5. Delete, replace and "never show a deleted file"

- **Marking stays database logic, unchanged:** `remove_my_intro`, a replacement in `worker_complete_intro_job`, `delete_my_wall_asset_resolving`, rendition and share supersede.
  - New: in the same transaction the affected registry rows move to `deleting`.
  - Every delivery predicate (lease, crawler decision, owner lease) requires `state = 'stored'` **and** a current reference. A deleted or replaced file therefore stops being leasable at commit time. The only exceptions are a lease already issued (at most 120 s Intro, 6 h Wall, the current contract) and a crawler response cached for 60 s.
- **Physical delete with a guaranteed run.** This fixes the REV-0033 findings.
  - A trigger dispatches a Job run when a row enters `deleting` (the existing pg_net dispatch).
  - A pg_cron safety net re-dispatches while any `deleting` row is older than 10 minutes. pg_cron is already installed and used on TESTING (`gamid-cron-log-retention`, `play-together-voice-reconcile-testing`), so this is a migration, not new infrastructure.
  - The Job sends the signed DELETE, then confirms. `deleted` keeps `r2_deleted_at` as a tombstone.
  - On failure: `delete_attempts` + 1 and `last_error` are recorded. After 5 attempts the row stays `deleting` (still counted, still never served) and appears in an operator check; it is never silently dropped.
- **Replace never brings the old file back:** every upload and derivative gets a new key (uuid paths plus a per-attempt token), and `deleting`/`deleted` are terminal.
- **Orphans:**
  - registry keys survive a profile-row delete, because the registry references the owner with no cascade;
  - a reclaimed attempt writes a new key and supersedes the old attempt's row, which keeps its key and is deleted;
  - a periodic R2 `list()` reconcile through the Worker (prefix by owner) finds keys with no row. It reports them and deletes them only after a grace period.
- **Out-of-band loss: no automatic restore.**
  - A promoted file missing in R2 is a 404 to the visitor (no Supabase copy exists by design), and the reconcile reports it.
  - A missing landing object behaves exactly as today.

## 6. Reads, leases and privacy

- **Visitors:** `public-media` keeps `public_media_lease_allowed` (with the registry state added) and signs a Worker lease (`/media/v1/<key>?exp&sig`) with the same lifetimes. `serveR2Object` is already tested for Range, suffix, clamp, 416 and HEAD; it needs MP4 content types for Wall.
- **Owners:** a new owner-lease action, with the owner JWT verified and an owner check in Postgres, gives the same HMAC lease. Owner preview and the editors switch to it for promoted objects.
- **Crawler routes:** for a promoted object the decision answers `r2` directly; no pilot allow-list or fallback budget applies, because there is no Supabase copy.
- **Workers (Cloud Run):** a new signed `GET /media/v1-ingest/<key>` with Range, using the ingest key and the same message format. Wall sources are streamed to disk.
- **The bucket stays private:** no public access, no r2.dev, no custom domain. Only the Worker binding touches it.

## 7. Pilot scope, switches and rollback

- New `private.media_r2_primary_settings` (`enabled` false) and `private.media_r2_primary_owners` (allow-list); first entry the GM-TEST-01 owner only, never all TESTING users at once.
  - The Worker gets its own var `MEDIA_R2_PRIMARY` ("off" in `wrangler.jsonc`).
- **Rollback, new uploads:** switch off. Uploads stay in Supabase (today's behaviour) within seconds, because the landing zone *is* today's path.
- **Rollback, already promoted files:** they stay readable from R2 through the registry. Switching off never hides them.
  - Moving them back is a manual, approved operator action, not an automatic restore.
  - For GM-TEST-01 (synthetic) they can simply be deleted.
- Architecture F (`media_r2_replicas`, the delivery decision, the fallback budget) stays untouched and OFF; it is removed only after R2 Primary is accepted.

## 8. Phase 2 work list (implementation, TESTING only)

**Step 1 done locally (§151), NOT applied to TESTING:** `supabase/migrations/20261030140000_media_r2_primary_registry.sql`, tested by `tests/media-r2-primary-registry-db.test.js` (10 PGlite tests).

**Tables:**
- `private.media_objects`, the registry;
- `private.media_r2_primary_settings` (`enabled` false);
- `private.media_r2_primary_owners` (empty).

**State machine:** `pending → stored | failed`, `stored → deleting | missing`, `missing → deleting`, `failed | deleting → deleted`. A trigger enforces the transitions and the immutable fields, and rows are never deleted.

**Quota:**
- A derived counted object reserves through the existing `reserve_usage_upload` (same lock, quota, caps and MIME). Its receipt is bound to `r2:<key>`, so gateway actions on it are refused (`UPLOAD_R2_MANAGED`).
- A promotion adds nothing: its landing object stops counting at `stored`.
- `usage_stored_bytes`, `get_my_usage_impl`, `reserve_usage_upload` and `usage_upload_action` are the live TESTING definitions plus registry additions only. The baseline is snapshotted in `tests/fixtures/usage-functions-before-r2-primary.sql`.

**Delivery:** `media_r2_servable_key` answers for `stored` only.

**Deletes:**
- a claim queue with attempts, a retry interval and recorded errors;
- an abandoned `pending` expires after 30 minutes;
- an operator list after the maximum attempts;
- landing-object cleanup candidates.

**Worker:** `public.worker_media_r2_*` wrappers, service role only.

**Not yet:**
- wiring into `remove_my_intro` / replace / Wall delete, `public-media` and the Worker;
- the dispatch trigger and the pg_cron safety net (with the Job step: the dispatcher must learn the table first);
- the live concurrency test on TESTING.

**Original phase 2 list (remaining items continue from here):**

1. Migration:
   - the registry, settings and allow-list;
   - quota and Usage sums;
   - registry-aware predicates;
   - promote, delete, confirm and claim RPCs;
   - the dispatch trigger;
   - the pg_cron safety net;
   - PGlite tests.
2. Worker:
   - ingest GET (Range);
   - PUT with a per-logical-bucket size cap and content type;
   - multipart through the binding (create, part, complete, abort);
   - owner-prefix `list()` for the reconcile;
   - `MEDIA_R2_PRIMARY`.
   - Measure CPU and time for 50 MiB.
3. Job:
   - the promote step;
   - D3, share and rendition outputs to R2;
   - poster and HEVC reads from R2;
   - the delete step with attempts.
4. `public-media`: Wall R2 leases and the owner lease. Client: lease acceptance, the F6-A cache, owner preview.
5. Tests 1-10 of the task on GM-TEST-01, including the comparison with today's encodes. FFmpeg settings are unchanged, so D3, the HEVC derivative and renditions of the same input are compared by size, codec, dimensions, faststart (`moov` before `mdat`) and SSIM/VMAF. Multithreaded encoders are not guaranteed byte-identical.

**Needs Mazen** (each separately):
- Job image and dispatcher redeploys (Cloud Shell);
- enabling the allow-list for GM-TEST-01;
- GM-TEST-01 temporarily PUBLIC for E2E;
- Workers Paid, if the 50 MiB CPU measurement exceeds the Free limit;
- any R2 lifecycle rule beyond the bucket default.
