// R2 Primary phase 2 step 1 (DEC-0014; docs/R2-PRIMARY-MIGRATION.md; handoff §151): the R2 object registry and its quota wiring, against the REAL migrations in
// an isolated PGlite Postgres - the Global Usage gateway (20261004170252 + the 15-video limit) for quota, and the Architecture F chain for "F is untouched".
// Supabase's own pieces (auth, storage tables, vault, pg_net) are stubs. Two real sessions racing for the same owner's quota need real connections: the
// serialization is the existing per-owner advisory lock (asserted statically here) and is exercised live on TESTING when Mazen approves applying it.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const REGISTRY = read("supabase/migrations/20261030140000_media_r2_primary_registry.sql");
// §153: ownership proof for existing files + the Worker's revocation check (applied after REGISTRY; tests 11-13)
const OWNERSHIP = read("supabase/migrations/20261101100000_media_r2_primary_ownership_and_serving.sql");
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const SHA = "a".repeat(64), SHA2 = "b".repeat(64);
const MB = 1_000_000;

async function usageFixture({ apply = true, ownership = false } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
    create schema private; create schema storage; create schema auth; create schema realtime;
    grant usage on schema public, private, storage, auth to authenticated, service_role, anon;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function realtime.send(jsonb, text, text, boolean) returns void language sql as $$ select $$;
    create table storage.objects (bucket_id text, name text, owner_id text, metadata jsonb, primary key (bucket_id, name));
    create table storage.buckets (id text primary key, file_size_limit bigint, allowed_mime_types text[]);
    insert into storage.buckets values ('avatars', 5242880, array['image/webp']), ('wall-media', 5242880, array['image/png']), ('wall-video', 52428800, array['video/mp4', 'video/webm']),
      ('intro-sources', 52428800, array['video/mp4']), ('intro-media', 15728640, array['video/webm']), ('wall-video-derived', 209715200, array['video/mp4']),
      ('wall-video-renditions', 39321600, array['video/mp4']), ('intro-share-copies', 15728640, array['video/webm']), ('intro-posters', 1048576, array['image/webp']);
    create table public.intro_processing_jobs (source_path text, state text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.entities (entity_id uuid, entity_type text);
    create table public.wall_drafts (entity_id uuid, document jsonb);
    create table public.wall_assets (entity_id uuid, mime_type text);
    create table public.wall_fonts (owner_id uuid);
    create table public.crews (crew_id uuid, name text, owner_entity_id uuid);
    create table public.crew_members (crew_id uuid, entity_id uuid, status text);
    create table public.crew_walls (crew_id uuid, stage_count integer);
    create table private.crew_policy (singleton boolean, max_members integer, wall_stage_allowance integer);
    insert into private.crew_policy values (true, 15, 2);
    create function private.crew_wall_stage_allowance(uuid) returns integer language sql as $$ select wall_stage_allowance from private.crew_policy $$;
    create function private.wall_font_limit() returns integer language sql as $$ select 10 $$;
    create function private.wall_font_slots_used(uuid, text) returns integer language sql as $$ select 0 $$;`);
  for (const name of ["register_verified_wall_asset_impl", "create_wall_video_job_impl", "worker_complete_wall_video_job_impl", "update_my_identity_profile_impl", "queue_my_intro_impl"])
    await db.exec(`create function private.${name}() returns void language plpgsql as $$declare candidate_owner uuid;caller uuid;begin perform 1 from storage.objects o where o.owner_id = caller::text; if (select 0) >= 60 then raise exception 'WALL_ASSET_LIMIT';end if;if (select 0) >= 10 then raise exception 'WALL_VIDEO_LIMIT';end if;end$$;`);
  await db.exec(read("supabase/migrations/20261004170252_global_usage_gateway.sql"));
  await db.exec(read("supabase/migrations/20261005025319_wall_video_limit_15.sql"));
  // the live TESTING definitions this migration starts from (patched in place over time by F8-B1, share copies, posters, ISS-0011, fonts, crews)
  await db.exec(read("tests/fixtures/usage-functions-before-r2-primary.sql"));
  if (apply) await db.exec(REGISTRY);
  if (ownership) await db.exec(OWNERSHIP);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  // storageOwner: what storage.objects.owner_id records (the uploader), independent of the folder; null = not recorded
  const object = (bucket, path, n, owner = OWNER, storageOwner = owner) => db.query("insert into storage.objects values ($1, $2, $3, $4)", [bucket, `${owner}/${path}`, storageOwner, { size: n }]);
  const receipt = (bucket, path, n, mime, state = "COMPLETE", owner = OWNER) =>
    one(`insert into private.usage_uploads (owner_id, bucket, path, expected_bytes, content_type, state) values ($1, $2, $3, $4, $5, $6) returning upload_id`, [owner, bucket, `${owner}/${path}`, n, mime, state]);
  const enable = async (owner = OWNER) => {
    await db.query("update private.media_r2_primary_settings set enabled = true");
    await db.query("insert into private.media_r2_primary_owners (owner_id, note) values ($1, 'test') on conflict do nothing", [owner]);
  };
  const register = (kind, bucket, path, n, sha = SHA, owner = OWNER) =>
    one(`select * from public.worker_media_r2_register($1, $2, $3, $4, $5, $6)`, [kind, owner, bucket, `${owner}/${path}`, n, sha]);
  const complete = (r, n, sha = SHA) => one(`select public.worker_media_r2_complete($1, $2, $3, $4) s`, [r.object_id, r.claim_token, n, sha]).then(x => x.s);
  const fail = (r, code = "R2_PUT_FAILED") => db.query(`select public.worker_media_r2_fail($1, $2, $3)`, [r.object_id, r.claim_token, code]);
  const row = id => one(`select state, bytes::text, failure_code, delete_reason, delete_attempts, last_error, counted, category, source_kind, r2_key from private.media_objects where object_id = $1`, [id]);
  const stored = async (owner = OWNER) => Number((await one("select private.usage_stored_bytes($1)::text n", [owner])).n);
  const reserved = async (owner = OWNER) => Number((await one("select private.usage_reserved_bytes($1)::text n", [owner])).n);
  const servable = (bucket, path, owner = OWNER) => one("select private.media_r2_servable_key($1, $2) k", [bucket, `${owner}/${path}`]).then(x => x.k);
  const requestDelete = (bucket, path, reason = "USER_DELETE", owner = OWNER) => one("select private.media_r2_request_delete_impl($1, $2, $3) n", [bucket, `${owner}/${path}`, reason]).then(x => x.n);
  const claimDeletes = () => db.query("select * from public.worker_media_r2_delete_claim(20)").then(r => r.rows);
  const confirm = (r, ok, error = null) => one("select public.worker_media_r2_delete_confirm($1, $2, $3, $4) s", [r.object_id, r.r2_key, ok, error]).then(x => x.s);
  const usage = async (owner = OWNER) => {
    await db.exec(`set role authenticated; set request.jwt.claim.sub = '${owner}';`);
    try { return (await one("select public.get_my_usage() x")).x; } finally { await db.exec("reset role; reset request.jwt.claim.sub;"); }
  };
  const rejects = (promise, message) => assert.rejects(promise, error => { assert.match(error.message, message); return true; });
  return { db, one, object, receipt, enable, register, complete, fail, row, stored, reserved, servable, requestDelete, claimDeletes, confirm, usage, rejects };
}

test("1. a new record: only for an allow-listed owner with R2 Primary on; a derived counted object reserves its bytes through the existing receipt, bound to R2", async () => {
  const f = await usageFixture();
  await f.rejects(f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB), /R2_PRIMARY_DISABLED/);
  await f.db.query("insert into private.media_r2_primary_owners (owner_id, note) values ($1, 'test')", [OWNER]);
  await f.rejects(f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB), /R2_PRIMARY_DISABLED/, "the switch is still off");
  await f.enable();
  await f.rejects(f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB, SHA, OTHER), /R2_PRIMARY_DISABLED/, "another owner is not in the allow-list");
  const r = await f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB);
  assert.equal(r.r2_key, `primary/intro-media/${OWNER}/job1/intro-d3.webm/${r.object_id}`);
  assert.deepEqual(await f.row(r.object_id), { state: "pending", bytes: null, failure_code: null, delete_reason: null, delete_attempts: 0, last_error: null, counted: true, category: "intro", source_kind: "derived", r2_key: r.r2_key });
  const receipt = await f.one("select state, upstream_url, expected_bytes::text n, content_type from private.usage_uploads where path = $1", [`${OWNER}/job1/intro-d3.webm`]);
  assert.deepEqual(receipt, { state: "ACTIVE", upstream_url: `r2:${r.r2_key}`, n: String(10 * MB), content_type: "video/webm" });
  assert.deepEqual([await f.stored(), await f.reserved()], [0, 10 * MB], "pending: reserved, not yet stored");
  // invalid input never creates a row: another owner's folder, traversal, over the bucket cap, a bad digest, an unknown bucket or kind
  await f.rejects(f.one(`select * from public.worker_media_r2_register('derived', $1, 'intro-media', $2, 10, $3)`, [OWNER, `${OTHER}/x.webm`, SHA]), /INVALID_MEDIA_OBJECT/);
  await f.rejects(f.register("derived", "intro-media", "../x.webm", 10), /INVALID_MEDIA_OBJECT/);
  await f.rejects(f.register("derived", "intro-media", "big.webm", 15728641), /INVALID_MEDIA_OBJECT/);
  await f.rejects(f.register("derived", "intro-media", "bad.webm", 10, "xyz"), /INVALID_MEDIA_OBJECT/);
  await f.rejects(f.register("derived", "avatars", "a.webp", 10), /INVALID_MEDIA_OBJECT/);
  await f.rejects(f.register("copied", "intro-media", "c.webm", 10), /INVALID_MEDIA_OBJECT/);
  // an uncounted internal copy takes no reservation
  const share = await f.register("derived", "intro-share-copies", "job1/share.webm", 2 * MB);
  assert.equal((await f.row(share.object_id)).counted, false);
  assert.equal(await f.reserved(), 10 * MB);
  assert.equal((await f.one("select count(*)::int n from private.media_objects")).n, 2);
});

test("2. transitions: pending -> stored only with the attempt's token and R2's verified size + digest; the state machine and the row's identity are enforced", async () => {
  const f = await usageFixture();
  await f.enable();
  const r = await f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB);
  await f.rejects(f.complete({ ...r, claim_token: crypto.randomUUID() }, 10 * MB), /MEDIA_OBJECT_NOT_PENDING/);
  assert.equal(await f.complete(r, 10 * MB), "stored");
  assert.equal((await f.row(r.object_id)).bytes, String(10 * MB));
  assert.equal((await f.one("select state from private.usage_uploads where path = $1", [`${OWNER}/job1/intro-d3.webm`])).state, "COMPLETE", "the receipt is the ownership proof, as for a Supabase upload");
  assert.deepEqual([await f.stored(), await f.reserved()], [10 * MB, 0]);
  await f.rejects(f.complete(r, 10 * MB), /MEDIA_OBJECT_NOT_PENDING/, "a second completion is refused");
  await f.rejects(f.db.query("update private.media_objects set state = 'pending' where object_id = $1", [r.object_id]), /MEDIA_OBJECT_INVALID_TRANSITION/);
  await f.rejects(f.db.query("update private.media_objects set state = 'deleted', r2_deleted_at = now() where object_id = $1", [r.object_id]), /MEDIA_OBJECT_INVALID_TRANSITION/, "stored never skips 'deleting'");
  await f.rejects(f.db.query("update private.media_objects set r2_key = 'primary/x' where object_id = $1", [r.object_id]), /MEDIA_OBJECT_IMMUTABLE/);
  await f.rejects(f.db.query("update private.media_objects set counted = false where object_id = $1", [r.object_id]), /MEDIA_OBJECT_IMMUTABLE/);
  await f.rejects(f.db.query("delete from private.media_objects where object_id = $1", [r.object_id]), /MEDIA_OBJECT_ROWS_ARE_KEPT/);
  // the gateway can't act on an R2-managed receipt (bind, complete, cancel, release)
  const upload = (await f.one("select upload_id from private.usage_uploads where path = $1", [`${OWNER}/job1/intro-d3.webm`])).upload_id;
  for (const action of ["bind", "complete", "cancel", "release_unbound"])
    await f.rejects(f.one("select public.usage_upload_action($1, $2, $3, 'https://x') x", [upload, OWNER, action]), /UPLOAD_R2_MANAGED/, action);
  assert.equal((await f.one("select public.usage_upload_action($1, $2, 'get') x", [upload, OWNER])).x.state, "COMPLETE");
});

test("3. a file moved from its Supabase landing object to R2 is counted exactly once at every step; duplicates are refused", async () => {
  const f = await usageFixture();
  await f.enable();
  await f.object("wall-video", "clip.mp4", 30 * MB);
  await f.receipt("wall-video", "clip.mp4", 30 * MB, "video/mp4");
  assert.equal(await f.stored(), 30 * MB);
  await f.rejects(f.register("promoted", "wall-video", "clip.mp4", 30 * MB - 1), /LANDING_OBJECT_MISMATCH/);
  await f.rejects(f.register("promoted", "wall-video", "nope.mp4", 30 * MB), /LANDING_OBJECT_MISMATCH/);
  await f.object("wall-video", "foreign.mp4", 5 * MB);   // in the owner's folder but not their completed upload
  await f.rejects(f.register("promoted", "wall-video", "foreign.mp4", 5 * MB), /LANDING_OBJECT_NOT_OWNED/);
  await f.rejects(f.register("derived", "wall-video", "clip.mp4", 30 * MB), /MEDIA_OBJECT_EXISTS/, "a derived write never overlays a stored landing object");
  const r = await f.register("promoted", "wall-video", "clip.mp4", 30 * MB);
  assert.deepEqual([await f.stored(), await f.reserved()], [35 * MB, 0], "pending promotion: the landing object alone counts, nothing is reserved twice");
  await f.rejects(f.register("promoted", "wall-video", "clip.mp4", 30 * MB), /MEDIA_OBJECT_EXISTS/);
  assert.equal(await f.complete(r, 30 * MB), "stored");
  assert.deepEqual([await f.stored(), await f.reserved()], [35 * MB, 0], "stored: the R2 object counts and the landing object stops counting");
  assert.deepEqual((await f.db.query("select * from public.worker_media_r2_landing_cleanup(20)")).rows, [{ bucket: "wall-video", path: `${OWNER}/clip.mp4` }]);
  await f.db.query("delete from storage.objects where name = $1", [`${OWNER}/clip.mp4`]);   // the worker deletes the temporary landing object
  assert.equal(await f.stored(), 35 * MB);
  assert.deepEqual((await f.db.query("select * from public.worker_media_r2_landing_cleanup(20)")).rows, []);
  assert.equal((await f.usage()).media.wall, 35 * MB, "Global Usage shows the same total");
  // the path stays taken while the R2 object lives: no new upload or registration can reuse it
  await f.rejects(f.one("select public.reserve_usage_upload($1, 'wall-video', $2, 10, 'video/mp4') x", [OWNER, `${OWNER}/clip.mp4`]), /OBJECT_ALREADY_EXISTS|UPLOAD_CONFLICT/);
  await f.rejects(f.register("derived", "wall-video", "clip.mp4", 30 * MB), /MEDIA_OBJECT_EXISTS/);
  assert.equal((await f.one("select count(*)::int n from private.usage_uploads where path = $1", [`${OWNER}/clip.mp4`])).n, 1, "the original receipt is kept");
});

test("4. two uploads of the same owner: registrations and reservations share the quota check and the per-owner lock, so the 200,000,000 bytes are never exceeded", async () => {
  const f = await usageFixture();
  await f.enable();
  const a = await f.register("derived", "wall-video-derived", "a.h264.mp4", 120 * MB);
  await f.rejects(f.register("derived", "wall-video-derived", "b.h264.mp4", 120 * MB), /ACCOUNT_STORAGE_QUOTA_EXCEEDED/, "the second one sees the first one's reservation");
  await f.rejects(f.one("select public.reserve_usage_upload($1, 'wall-video-derived', $2, $3, 'video/mp4') x", [OWNER, `${OWNER}/c.h264.mp4`, 80 * MB + 1]), /ACCOUNT_STORAGE_QUOTA_EXCEEDED/, "a gateway upload too");
  await f.one("select public.reserve_usage_upload($1, 'wall-video-derived', $2, $3, 'video/mp4') x", [OWNER, `${OWNER}/c.h264.mp4`, 80 * MB]);
  await f.rejects(f.register("derived", "intro-media", "d.webm", 1), /ACCOUNT_STORAGE_QUOTA_EXCEEDED/, "exactly at the quota");
  await f.complete(a, 120 * MB);
  await f.rejects(f.register("derived", "intro-media", "d.webm", 1), /ACCOUNT_STORAGE_QUOTA_EXCEEDED/, "stored + the other reservation still fill it");
  assert.deepEqual([await f.stored(), await f.reserved()], [120 * MB, 80 * MB]);
  assert.equal(await f.stored(OTHER), 0, "another owner is independent");
  // the serialization is the existing lock, with the same key, taken before any check
  const lock = "pg_advisory_xact_lock(hashtextextended('usage:' || candidate_owner::text, 0))";
  const source = REGISTRY.slice(REGISTRY.indexOf("create function private.media_r2_register_impl"), REGISTRY.indexOf("create function private.media_r2_complete_impl"));
  assert.ok(source.includes(lock) && source.indexOf(lock) < source.indexOf("MEDIA_OBJECT_EXISTS"), "the registration locks before it checks");
  assert.ok(REGISTRY.includes("perform pg_advisory_xact_lock(hashtextextended('usage:'||u::text,0));"), "reserve_usage_upload keeps the same lock");
});

test("5. a failed transfer to R2: never served, the reservation released, the landing object still counted; abandoned and mismatched uploads fail too", async () => {
  const f = await usageFixture();
  await f.enable();
  const r = await f.register("derived", "intro-media", "j/intro-d3.webm", 10 * MB);
  await f.fail(r, "R2_PUT_FAILED");
  assert.deepEqual([(await f.row(r.object_id)).state, (await f.row(r.object_id)).failure_code], ["failed", "R2_PUT_FAILED"]);
  assert.equal((await f.one("select state from private.usage_uploads where path = $1", [`${OWNER}/j/intro-d3.webm`])).state, "CANCELLED");
  assert.deepEqual([await f.stored(), await f.reserved(), await f.servable("intro-media", "j/intro-d3.webm")], [0, 0, null]);
  await f.rejects(f.complete(r, 10 * MB), /MEDIA_OBJECT_NOT_PENDING/, "a late completion of the failed attempt is refused");
  // a retry is a new attempt: a new row and a new key
  const retry = await f.register("derived", "intro-media", "j/intro-d3.webm", 10 * MB);
  assert.notEqual(retry.r2_key, r.r2_key);
  assert.equal(await f.complete(retry, 10 * MB, SHA2), "failed", "R2's digest differs from the registered one");
  assert.equal((await f.row(retry.object_id)).failure_code, "VERIFICATION_MISMATCH");
  assert.deepEqual([await f.stored(), await f.reserved()], [0, 0]);
  // a promotion that fails leaves the landing object as the counted, live file
  await f.object("wall-video", "v.mp4", 20 * MB);
  await f.receipt("wall-video", "v.mp4", 20 * MB, "video/mp4");
  const p = await f.register("promoted", "wall-video", "v.mp4", 20 * MB);
  await f.fail(p, "R2_PUT_FAILED");
  assert.equal(await f.stored(), 20 * MB);
  assert.deepEqual((await f.db.query("select * from public.worker_media_r2_landing_cleanup(20)")).rows, [], "a landing object that never moved is never cleaned");
  // the landing object changed (the user deleted the asset) while it was being copied: the copy fails
  const q = await f.register("promoted", "wall-video", "v.mp4", 20 * MB);
  await f.db.query("delete from storage.objects where name = $1", [`${OWNER}/v.mp4`]);
  assert.equal(await f.complete(q, 20 * MB), "failed");
  assert.equal((await f.row(q.object_id)).failure_code, "SOURCE_CHANGED");
  // a worker that died mid-upload: the pending row expires and releases its reservation
  const lost = await f.register("derived", "intro-media", "k/intro-d3.webm", 5 * MB);
  await f.db.exec(`alter table private.media_objects disable trigger media_objects_guard; update private.media_objects set created_at = now() - interval '31 minutes' where object_id = '${lost.object_id}'; alter table private.media_objects enable trigger media_objects_guard;`);
  assert.equal(await f.reserved(), 5 * MB);
  await f.claimDeletes();
  assert.deepEqual([(await f.row(lost.object_id)).state, (await f.row(lost.object_id)).failure_code, await f.reserved()], ["failed", "ABANDONED", 0]);
  await f.rejects(f.fail(lost, "LATE"), /MEDIA_OBJECT_NOT_PENDING/);
});

test("6. delete: effective at commit (never served, no longer counted); the physical R2 delete is retried with recorded errors and never silently dropped", async () => {
  const f = await usageFixture();
  await f.enable();
  const r = await f.register("derived", "intro-media", "j/intro-d3.webm", 10 * MB);
  await f.complete(r, 10 * MB);
  assert.equal(await f.servable("intro-media", "j/intro-d3.webm"), r.r2_key);
  assert.equal(await f.requestDelete("intro-media", "j/intro-d3.webm"), 1);
  assert.deepEqual([(await f.row(r.object_id)).state, (await f.row(r.object_id)).delete_reason, await f.servable("intro-media", "j/intro-d3.webm"), await f.stored()], ["deleting", "USER_DELETE", null, 0]);
  assert.equal(await f.requestDelete("intro-media", "j/intro-d3.webm"), 0, "idempotent");
  await f.rejects(f.requestDelete("intro-media", "j/intro-d3.webm", "WHATEVER"), /INVALID_DELETE_REASON/);
  const back = async () => f.db.exec(`alter table private.media_objects disable trigger media_objects_guard; update private.media_objects set last_delete_attempt_at = now() - interval '11 minutes' where object_id = '${r.object_id}'; alter table private.media_objects enable trigger media_objects_guard;`);
  let claimed = await f.claimDeletes();
  assert.deepEqual(claimed, [{ object_id: r.object_id, r2_key: r.r2_key, delete_attempts: 1 }]);
  assert.equal(await f.confirm(claimed[0], false, "R2_DELETE_FAILED 502"), "deleting");
  assert.deepEqual([(await f.row(r.object_id)).state, (await f.row(r.object_id)).last_error], ["deleting", "R2_DELETE_FAILED 502"]);
  assert.deepEqual(await f.claimDeletes(), [], "not again before the retry interval");
  for (let attempt = 2; attempt <= 5; attempt += 1) {
    await back();
    claimed = await f.claimDeletes();
    assert.equal(claimed[0].delete_attempts, attempt);
    await f.confirm(claimed[0], false, null);
  }
  assert.equal((await f.row(r.object_id)).last_error, "UNKNOWN", "an empty error is still recorded");
  await back();
  assert.deepEqual(await f.claimDeletes(), [], "every attempt used: the queue stops claiming it");
  const stuck = (await f.db.query("select object_id, state, delete_attempts from private.media_r2_delete_stuck_impl()")).rows;
  assert.deepEqual(stuck, [{ object_id: r.object_id, state: "deleting", delete_attempts: 5 }], "it is listed for the operator, still never served");
  await f.rejects(f.confirm({ ...claimed[0], r2_key: "primary/other" }, true), /MEDIA_OBJECT_NOT_DELETABLE/);
  assert.equal(await f.confirm(claimed[0], true), "deleted");
  assert.deepEqual((await f.db.query("select object_id from private.media_r2_delete_stuck_impl()")).rows, []);
  await f.rejects(f.confirm(claimed[0], true), /MEDIA_OBJECT_NOT_DELETABLE/, "deleted is terminal");
  // a failed attempt's (possible) object waits out the ingest signature window before its delete
  const g = await f.register("derived", "intro-share-copies", "j/share.webm", MB);
  await f.fail(g);
  assert.deepEqual(await f.claimDeletes(), []);
  await f.db.exec(`alter table private.media_objects disable trigger media_objects_guard; update private.media_objects set failed_at = now() - interval '11 minutes' where object_id = '${g.object_id}'; alter table private.media_objects enable trigger media_objects_guard;`);
  assert.deepEqual((await f.claimDeletes()).map(x => x.object_id), [g.object_id]);
  // a delete during the upload fails the in-flight attempt
  const h = await f.register("derived", "intro-media", "m/intro-d3.webm", MB);
  assert.equal(await f.requestDelete("intro-media", "m/intro-d3.webm"), 1);
  assert.deepEqual([(await f.row(h.object_id)).state, (await f.row(h.object_id)).failure_code, await f.reserved()], ["failed", "DELETED_DURING_UPLOAD", 0]);
  await f.rejects(f.complete(h, MB), /MEDIA_OBJECT_NOT_PENDING/);
});

test("7. replace: the new Intro reserves, then counts; the old one stops counting when it is replaced - never lost, never counted twice, never back", async () => {
  const f = await usageFixture();
  await f.enable();
  const old = await f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB);
  await f.complete(old, 10 * MB);
  const next = await f.register("derived", "intro-media", "job2/intro-d3.webm", 12 * MB);
  assert.deepEqual([await f.stored(), await f.reserved()], [10 * MB, 12 * MB], "both files exist: the live one and the one being written");
  await f.complete(next, 12 * MB);
  assert.deepEqual([await f.stored(), await f.reserved()], [22 * MB, 0]);
  assert.equal(await f.requestDelete("intro-media", "job1/intro-d3.webm", "REPLACED"), 1);   // the same transaction that moves active_job_id, when wired
  assert.deepEqual([await f.stored(), await f.reserved()], [12 * MB, 0]);
  assert.deepEqual([await f.servable("intro-media", "job1/intro-d3.webm"), await f.servable("intro-media", "job2/intro-d3.webm")], [null, next.r2_key]);
  assert.deepEqual((await f.usage()).media, { intro: 12 * MB });
  // the old file never returns: its path can't be registered or reserved again
  await f.rejects(f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB), /UPLOAD_CONFLICT|OBJECT_ALREADY_EXISTS/);
  assert.equal((await f.row(old.object_id)).state, "deleting");
});

test("8. logical access: only a stored object has a key; pending, failed, deleting, deleted and missing never do; a missing file is never re-created; no client can reach the registry", async () => {
  const f = await usageFixture();
  await f.enable();
  const r = await f.register("derived", "wall-video-derived", "x.h264.mp4", 5 * MB);
  assert.equal(await f.servable("wall-video-derived", "x.h264.mp4"), null, "pending");
  await f.complete(r, 5 * MB);
  assert.equal(await f.servable("wall-video-derived", "x.h264.mp4"), r.r2_key, "stored");
  assert.equal((await f.one("select public.worker_media_r2_mark_missing($1) s", [r.object_id])).s, "missing");
  assert.deepEqual([await f.servable("wall-video-derived", "x.h264.mp4"), await f.stored()], [null, 0], "lost outside GamID: not served, not counted");
  await f.rejects(f.register("derived", "wall-video-derived", "x.h264.mp4", 5 * MB), /MEDIA_OBJECT_EXISTS/, "no automatic restore");
  assert.equal((await f.one("select public.worker_media_r2_mark_missing($1) s", [r.object_id])).s, "missing", "idempotent; never back to stored");
  assert.equal(await f.requestDelete("wall-video-derived", "x.h264.mp4"), 1);
  assert.deepEqual([(await f.row(r.object_id)).state, (await f.row(r.object_id)).delete_reason], ["deleting", "MISSING_CLEANUP"]);
  assert.equal(await f.servable("wall-video-derived", "x.h264.mp4"), null);
  const can = async (role, fn) => (await f.one("select has_function_privilege($1, $2, 'execute') ok", [role, fn])).ok;
  const workerFns = ["public.worker_media_r2_register(text, uuid, text, text, bigint, text, text)", "public.worker_media_r2_complete(uuid, uuid, bigint, text)",
    "public.worker_media_r2_fail(uuid, uuid, text)", "public.worker_media_r2_mark_missing(uuid)", "public.worker_media_r2_delete_claim(integer)",
    "public.worker_media_r2_delete_confirm(uuid, text, boolean, text)", "public.worker_media_r2_landing_cleanup(integer)"];
  const internal = ["private.media_r2_request_delete_impl(text, text, text)", "private.media_r2_servable_key(text, text)", "private.media_r2_delete_stuck_impl()",
    "private.media_r2_primary_active(uuid)", "private.media_r2_landing_moved(text, text)", "private.media_r2_fail_row(private.media_objects, text)"];
  for (const role of ["anon", "authenticated"]) for (const fn of [...workerFns, ...internal]) assert.equal(await can(role, fn), false, `${role} ${fn}`);
  for (const fn of workerFns) assert.equal(await can("service_role", fn), true, fn);
  for (const fn of internal) assert.equal(await can("service_role", fn), false, fn);
  for (const role of ["anon", "authenticated", "service_role"]) for (const table of ["private.media_objects", "private.media_r2_primary_settings", "private.media_r2_primary_owners"])
    assert.equal((await f.one("select has_table_privilege($1, $2, 'select') ok", [role, table])).ok, false, `${role} ${table}`);
});

test("9. existing records: with an empty registry every quota, Usage and receipt answer is exactly what it was before the migration", async () => {
  const seed = async f => {
    await f.object("avatars", "a.webp", 2 * MB); await f.object("intro-sources", "j/source.mp4", 30 * MB); await f.object("intro-media", "j/intro-d3.webm", 10 * MB);
    await f.object("wall-media", "i.png", 4 * MB); await f.object("wall-video", "v.mp4", 35 * MB); await f.object("wall-video-derived", "d.h264.mp4", 20 * MB);
    await f.object("wall-video-renditions", "r/t.mp4", 9 * MB); await f.object("intro-share-copies", "j/share.webm", 3 * MB); await f.object("intro-posters", "j/p.webp", MB);
    await f.object("avatars", "o.webp", 5 * MB, OTHER);
    await f.receipt("wall-video", "v.mp4", 35 * MB, "video/mp4");
    await f.receipt("wall-video", "pending.mp4", 7 * MB, "video/mp4", "ACTIVE");
  };
  const answers = async f => ({
    stored: [await f.stored(), await f.stored(OTHER)], reserved: await f.reserved(), usage: (({ storage, media }) => ({ storage, media }))(await f.usage()),
    // receipts behave as before: an existing object is refused, a stale COMPLETE receipt is replaced, the quota bound holds
    duplicate: await f.one("select public.reserve_usage_upload($1, 'wall-video', $2, 1, 'video/mp4') x", [OWNER, `${OWNER}/v.mp4`]).then(r => r.x.state, e => e.message),
    stale: await f.db.query("delete from storage.objects where name = $1", [`${OWNER}/v.mp4`]).then(() => f.one("select public.reserve_usage_upload($1, 'wall-video', $2, 35000000, 'video/mp4') x", [OWNER, `${OWNER}/v.mp4`])).then(r => r.x.state, e => e.message),
    full: await f.one("select public.reserve_usage_upload($1, 'wall-video', $2, 52000000, 'video/mp4') x", [OWNER, `${OWNER}/big.mp4`]).then(r => r.x.state, e => e.message),
  });
  const before = await usageFixture({ apply: false });
  await seed(before);
  const after = await usageFixture();
  await seed(after);
  const [a, b] = [await answers(before), await answers(after)];
  assert.deepEqual(b, a);
  assert.deepEqual(b.stored, [101 * MB, 5 * MB], "internal copies (renditions, share copies, posters) still never count");
  assert.equal(b.duplicate, "UPLOAD_CONFLICT", "an already-uploaded path is never reserved again with another size, as before");
  // the gateway's own receipt actions are unchanged for a Supabase upload
  const id = (await after.one("select upload_id from private.usage_uploads where path = $1", [`${OWNER}/pending.mp4`])).upload_id;
  await after.rejects(after.one("select public.usage_upload_action($1, $2, 'complete') x", [id, OWNER]), /UPLOAD_SIZE_MISMATCH/);
  await after.one("select public.usage_upload_action($1, $2, 'bind', 'https://tus/upload/1') x", [id, OWNER]);
  await after.object("wall-video", "pending.mp4", 7 * MB);
  assert.equal((await after.one("select public.usage_upload_action($1, $2, 'complete') x", [id, OWNER])).x.state, "COMPLETE");
  assert.equal((await after.one("select count(*)::int n from private.media_objects")).n, 0);
});

test("10. Architecture F is untouched: its tables, switches, functions and delivery answers are identical after the migration", async () => {
  const db = new PGlite();
  const A = "11111111-1111-4111-8111-111111111111", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", PA = "aaaaaaaa-0000-4000-8000-00000000000a", J1 = "00000001-0000-4000-8000-000000000001";
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage; create schema vault; create schema net;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create table auth.users (id uuid primary key);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    create function storage.foldername(name text) returns text[] language sql immutable as $$ select string_to_array(name, '/') $$;
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table net.calls (body jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$ insert into net.calls values (body) returning 1 $$;
    insert into vault.decrypted_secrets values ('gamid_intro_dispatch_url_testing', 'https://dispatcher.example'), ('gamid_intro_dispatch_secret_testing', 'fixture-secret');
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key, entity_id uuid references public.entities(entity_id));
    insert into auth.users values ('${A}'); insert into public.entities values ('${EA}', 'SOLO', 'gm_test_01', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'); insert into public.profiles values ('${PA}', '${EA}');
    create function private.usage_stored_bytes(u uuid) returns bigint language sql stable as $$
      select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id<>'wall-video-renditions' $$;
    create function private.get_my_usage_impl() returns jsonb language sql stable as $$
      select coalesce(jsonb_object_agg(bucket_id, n), '{}') from (select o.bucket_id, sum((o.metadata->>'size')::bigint) n from storage.objects o
      where split_part(o.name,'/',1)=(select auth.uid())::text and o.bucket_id<>'wall-video-renditions' and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1) x $$;
    -- the usage tables the redefined usage functions declare row types of (the Global Usage gateway's, not part of Architecture F)
    create table private.usage_policy (singleton boolean primary key, quota_bytes bigint, near_limit numeric, approaching numeric, gateway_required boolean);
    create table private.usage_uploads (upload_id uuid primary key default gen_random_uuid(), owner_id uuid, bucket text, path text, expected_bytes bigint, content_type text,
      upstream_url text, state text default 'ACTIVE', updated_at timestamptz default now());`);
  for (const name of ["20260916170000_slice_3c_intro_identity.sql", "20260918130500_public_profile_intro_media_read.sql", "20261026120000_intro_discord_thumbnail.sql",
    "20261029100000_media_r2_pilot.sql", "20261030120000_media_r2_fallback_accounting.sql"]) await db.exec(read(`supabase/migrations/${name}`));
  const derivative = `${A}/${J1}/intro-d3.webm`;
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('intro-media', $1, '{"size": 3000000}')`, [derivative]);
  await db.query(`insert into public.intro_processing_jobs (job_id, profile_id, owner_user_id, state, requested_transition, source_path, source_mime, source_size_bytes, source_duration_ms,
    derivative_path, output_size_bytes, output_duration_ms, output_width, output_height, output_fps, output_has_audio)
    values ($1, $2, $3, 'ready', 'fade', $4, 'video/mp4', 1000, 8000, $5, 3000000, 8000, 1920, 1080, 30, true)`, [J1, PA, A, `${A}/${J1}/source.mp4`, derivative]);
  await db.query(`insert into public.profile_intro_settings (profile_id, active_job_id) values ($1, $2)`, [PA, J1]);
  await db.query("update private.media_r2_settings set delivery_enabled = true");
  const snapshot = async () => ({
    functions: (await db.query(`select p.oid::regprocedure::text sig, md5(pg_get_functiondef(p.oid)) d, coalesce(p.proacl::text, '') acl from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname in ('public', 'private') and (p.proname like '%media_r2%' or p.proname like '%intro_share%' or p.proname like '%media_delivery%') order by 1`)).rows,
    settings: (await db.query("select replication_enabled, delivery_enabled, fallback_daily_bytes::text, fallback_monthly_bytes::text, replications_per_day from private.media_r2_settings")).rows,
    tables: (await db.query(`select table_schema, table_name, column_name, data_type from information_schema.columns where table_name like 'media_r2%' and table_name not like 'media_r2_primary%' order by 1, 2, 3`)).rows,
    replicas: (await db.query("select count(*)::int n from public.media_r2_replicas")).rows,
  });
  const before = await snapshot();
  await db.exec("set role anon");
  const modeBefore = (await db.query("select mode from public.get_public_media_delivery('intro-media', $1)", [derivative])).rows[0].mode;
  await db.exec("reset role");
  await db.exec(REGISTRY);
  await db.exec(OWNERSHIP);   // both R2 Primary migrations, as TESTING will have them
  const after = await snapshot();
  const existing = new Set(before.functions.map(f => f.sig));
  assert.deepEqual(after.functions.filter(f => existing.has(f.sig)), before.functions, "every Architecture F / share-copy function is byte-identical, with the same grants");
  assert.ok(after.functions.filter(f => !existing.has(f.sig)).every(f => /media_r2_(primary|register|complete|fail_row|fail_impl|fail\(|mark_missing|delete_claim|delete_confirm|delete_stuck|landing|servable|object_servable|request_delete|bucket_rule)/.test(f.sig)),
    "the only additions are the registry's own functions");
  assert.deepEqual([after.settings, after.tables, after.replicas], [before.settings, before.tables, before.replicas]);
  await db.exec("set role anon");
  assert.equal((await db.query("select mode from public.get_public_media_delivery('intro-media', $1)", [derivative])).rows[0].mode, modeBefore);
  await db.exec("reset role");
  assert.equal(modeBefore, "supabase");
});

// --------------------------------------------------------------------------------------------- §153: 20261101100000 (ownership proof + revocation check)
test("11. promotion ownership: a COMPLETE receipt OR storage.objects.owner_id proves it; anything contradicting either is a conflict; no proof is refused", async () => {
  const f = await usageFixture({ ownership: true });
  await f.enable();
  const reject = (path, n, code, msg) => f.rejects(f.register("promoted", "wall-video", path, n), code).then(() => {}, e => { throw new Error(`${msg}: ${e.message}`); });
  // accepted: a legacy object with no receipt but the recorded uploader (most TESTING videos, §152); a new upload's receipt with no owner_id; both agreeing
  await f.object("wall-video", "legacy.mp4", 10 * MB);
  await f.object("wall-video", "receipt-only.mp4", 11 * MB, OWNER, null); await f.receipt("wall-video", "receipt-only.mp4", 11 * MB, "video/mp4");
  await f.object("wall-video", "both.mp4", 12 * MB); await f.receipt("wall-video", "both.mp4", 12 * MB, "video/mp4");
  const before = await f.stored();
  assert.equal(before, 33 * MB);
  const legacy = await f.register("promoted", "wall-video", "legacy.mp4", 10 * MB);
  const receiptOnly = await f.register("promoted", "wall-video", "receipt-only.mp4", 11 * MB);
  const both = await f.register("promoted", "wall-video", "both.mp4", 12 * MB);
  const source = id => f.one("select source_upload_id from private.media_objects where object_id = $1", [id]).then(r => r.source_upload_id);
  assert.equal(await source(legacy.object_id), null, "no receipt: proven by owner_id");
  assert.ok(await source(receiptOnly.object_id)); assert.ok(await source(both.object_id));
  assert.deepEqual([await f.stored(), await f.reserved()], [33 * MB, 0], "pending promotions reserve and add nothing");
  for (const [r, n] of [[legacy, 10 * MB], [receiptOnly, 11 * MB], [both, 12 * MB]]) assert.equal(await f.complete(r, n), "stored");
  assert.deepEqual([await f.stored(), await f.reserved()], [33 * MB, 0], "stored: each file counted once, never twice");
  await f.db.query("delete from storage.objects where name = any($1)", [[`${OWNER}/legacy.mp4`, `${OWNER}/receipt-only.mp4`, `${OWNER}/both.mp4`]]);
  assert.equal(await f.stored(), 33 * MB, "after the landing cleanup: still once");
  // refused: no proof at all
  await f.object("wall-video", "nobody.mp4", 5 * MB, OWNER, null);
  await reject("nobody.mp4", 5 * MB, /LANDING_OBJECT_NOT_OWNED/, "owner_id null, no receipt");
  // refused: another uploader recorded in the owner's folder, with or without the owner's receipt
  await f.object("wall-video", "foreign.mp4", 5 * MB, OWNER, OTHER);
  await reject("foreign.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "owner_id of another user");
  await f.object("wall-video", "foreign-receipt.mp4", 5 * MB, OWNER, OTHER); await f.receipt("wall-video", "foreign-receipt.mp4", 5 * MB, "video/mp4");
  await reject("foreign-receipt.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "receipt vs owner_id disagree");
  // refused: a receipt of another owner on this path, even with the right owner_id
  await f.object("wall-video", "other-receipt.mp4", 5 * MB);
  await f.db.query(`insert into private.usage_uploads (owner_id, bucket, path, expected_bytes, content_type, state) values ($1, 'wall-video', $2, $3, 'video/mp4', 'COMPLETE')`, [OTHER, `${OWNER}/other-receipt.mp4`, 5 * MB]);
  await reject("other-receipt.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "receipt of another owner");
  // refused: an upload in progress or cancelled, a COMPLETE receipt of another size - owner_id does not override them
  await f.object("wall-video", "active.mp4", 5 * MB); await f.receipt("wall-video", "active.mp4", 5 * MB, "video/mp4", "ACTIVE");
  await reject("active.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "ACTIVE receipt");
  await f.object("wall-video", "cancelled.mp4", 5 * MB); await f.receipt("wall-video", "cancelled.mp4", 5 * MB, "video/mp4", "CANCELLED");
  await reject("cancelled.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "CANCELLED receipt");
  await f.object("wall-video", "resized.mp4", 5 * MB); await f.receipt("wall-video", "resized.mp4", 6 * MB, "video/mp4");
  await reject("resized.mp4", 5 * MB, /LANDING_OWNERSHIP_CONFLICT/, "COMPLETE receipt of another size");
  // unchanged: size and existence are checked first, the folder must be the owner's, and another owner can never claim it
  await reject("legacy2.mp4", 5 * MB, /LANDING_OBJECT_MISMATCH/, "no object");
  await f.object("wall-video", "sized.mp4", 5 * MB);
  await reject("sized.mp4", 5 * MB - 1, /LANDING_OBJECT_MISMATCH/, "another size");
  await f.enable(OTHER);
  await f.rejects(f.one(`select * from public.worker_media_r2_register('promoted', $1, 'wall-video', $2, $3, $4)`, [OTHER, `${OWNER}/sized.mp4`, 5 * MB, SHA]), /INVALID_MEDIA_OBJECT/, "another owner, the owner's folder");
  await f.object("wall-video", "planted.mp4", 5 * MB, OTHER, OWNER);   // OWNER's upload placed in OTHER's folder
  await f.rejects(f.register("promoted", "wall-video", "planted.mp4", 5 * MB, SHA, OTHER), /LANDING_OWNERSHIP_CONFLICT/, "the folder owner is not the recorded uploader");
  // uncounted internal copies need no proof, but a contradiction is still refused
  await f.object("intro-share-copies", "j/share.webm", 2 * MB, OWNER, null);
  assert.ok((await f.register("promoted", "intro-share-copies", "j/share.webm", 2 * MB)).object_id);
  await f.object("intro-share-copies", "j/foreign.webm", 2 * MB, OWNER, OTHER);
  await f.rejects(f.register("promoted", "intro-share-copies", "j/foreign.webm", 2 * MB), /LANDING_OWNERSHIP_CONFLICT/);
  // nothing refused left a row, a reservation or a changed total
  assert.equal((await f.one("select count(*)::int n from private.media_objects")).n, 4);
  assert.deepEqual([await f.stored(), await f.reserved()], [33 * MB + 8 * 5 * MB, 0], "the 3 R2 files once + the 8 refused landing objects in the folder, as before");
});

test("12. derived objects and the rest of registration are exactly as before the ownership migration", async () => {
  for (const ownership of [false, true]) {
    const f = await usageFixture({ ownership });
    await f.enable();
    const r = await f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB);
    assert.equal(r.r2_key, `primary/intro-media/${OWNER}/job1/intro-d3.webm/${r.object_id}`);
    assert.deepEqual([await f.stored(), await f.reserved()], [0, 10 * MB], `ownership=${ownership}`);
    await f.object("intro-media", "job2/intro-d3.webm", MB);
    await f.rejects(f.register("derived", "intro-media", "job2/intro-d3.webm", MB), /MEDIA_OBJECT_EXISTS/);
    await f.rejects(f.register("derived", "intro-media", "job1/intro-d3.webm", 10 * MB), /MEDIA_OBJECT_EXISTS/);
    await f.db.query("update private.media_r2_primary_settings set enabled = false");
    await f.rejects(f.register("derived", "intro-media", "job3/intro-d3.webm", MB), /R2_PRIMARY_DISABLED/);
  }
});

test("13. media_r2_object_servable: true only while the exact key is 'stored'; pending, failed, deleting, deleted, missing, pilot and unknown keys are false; anon may ask", async () => {
  const f = await usageFixture({ ownership: true });
  await f.enable();
  const ask = async (key, role = "anon") => {
    await f.db.exec(`set role ${role}`);
    try { return (await f.one("select public.media_r2_object_servable($1) ok", [key])).ok; } finally { await f.db.exec("reset role"); }
  };
  const a = await f.register("derived", "wall-video-derived", "a.h264.mp4", MB);
  assert.equal(await ask(a.r2_key), false, "pending");
  await f.complete(a, MB);
  for (const role of ["anon", "authenticated", "service_role"]) assert.equal(await ask(a.r2_key, role), true, `stored, ${role}`);
  assert.equal(await ask(a.r2_key.replace(/.$/, c => (c === "0" ? "1" : "0"))), false, "another object id");
  assert.equal(await ask(a.r2_key + "x"), false);
  // the logical delete revokes at commit, before any physical delete
  assert.equal(await f.requestDelete("wall-video-derived", "a.h264.mp4"), 1);
  assert.equal(await ask(a.r2_key), false, "deleting");
  const [claim] = await f.claimDeletes();
  assert.equal(await f.confirm(claim, true), "deleted");
  assert.equal(await ask(a.r2_key), false, "deleted");
  const b = await f.register("derived", "wall-video-derived", "b.h264.mp4", MB);
  await f.fail(b);
  assert.equal(await ask(b.r2_key), false, "failed");
  const c = await f.register("derived", "wall-video-derived", "c.h264.mp4", MB);
  await f.complete(c, MB);
  await f.one("select public.worker_media_r2_mark_missing($1) s", [c.object_id]);
  assert.equal(await ask(c.r2_key), false, "missing");
  // a replacement (a new path, as an Intro re-render): the old key is revoked at once, the new one served
  const d1 = await f.register("derived", "wall-video-derived", "d1.h264.mp4", MB); await f.complete(d1, MB);
  const d2 = await f.register("derived", "wall-video-derived", "d2.h264.mp4", MB); await f.complete(d2, MB);
  await f.requestDelete("wall-video-derived", "d1.h264.mp4", "REPLACED");
  assert.deepEqual([await ask(d1.r2_key), await ask(d2.r2_key)], [false, true]);
  for (const key of [null, "", `intro-media/${OWNER}/j/intro-d3.webm/${a.object_id}`, `wall-video-derived/${OWNER}/a.h264.mp4`, "primary/" + "x".repeat(700)])
    assert.equal(await ask(key), false, String(key).slice(0, 40));
  // it reveals a boolean only: no registry table becomes readable, and nothing else became callable
  assert.equal((await f.one("select pg_get_function_result('public.media_r2_object_servable(text)'::regprocedure) t")).t, "boolean");
  for (const role of ["anon", "authenticated"]) {
    assert.equal((await f.one("select has_table_privilege($1, 'private.media_objects', 'select') ok", [role])).ok, false);
    assert.equal((await f.one("select has_function_privilege($1, 'public.worker_media_r2_register(text, uuid, text, text, bigint, text, text)', 'execute') ok", [role])).ok, false);
  }
});
