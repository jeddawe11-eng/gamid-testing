// Intro Thumbnail for Discord (Mazen's task 2026-10-26): the owner's frame selection, the share-copy queue, the public read path, the sweep and the quota
// exclusion - the REAL migration (20261026120000_intro_discord_thumbnail.sql) on top of the REAL accepted Intro schema (Slice 3C), in an isolated PGlite
// Postgres. Supabase's own pieces (auth, storage tables, Vault, pg_net) and the usage functions (in their live post-F8-B1 shape) are stubs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = read("supabase/migrations/20261026120000_intro_discord_thumbnail.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PA = "aaaaaaaa-0000-4000-8000-00000000000a", PB = "bbbbbbbb-0000-4000-8000-00000000000b";
const J1 = "00000001-0000-4000-8000-000000000001", J2 = "00000002-0000-4000-8000-000000000002";

async function fixture() {
  const db = new PGlite();
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
    insert into auth.users values ('${A}'), ('${B}');
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles values ('${PA}', '${EA}'), ('${PB}', '${EB}');
    -- the usage functions in their live shape after F8-B1 (the renditions bucket already excluded)
    create function private.usage_stored_bytes(u uuid) returns bigint language sql stable as $$
      select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id<>'wall-video-renditions' $$;
    create function private.get_my_usage_impl() returns jsonb language sql stable as $$
      select coalesce(jsonb_object_agg(bucket_id, n), '{}') from (select o.bucket_id, sum((o.metadata->>'size')::bigint) n from storage.objects o
      where split_part(o.name,'/',1)=(select auth.uid())::text and o.bucket_id<>'wall-video-renditions' and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1) x $$;`);
  await db.exec(read("supabase/migrations/20260916170000_slice_3c_intro_identity.sql"));
  await db.exec(MIGRATION);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const as = user => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user || ""]);
  const object = (bucket, name, size, ageMinutes = 0) => db.query(`insert into storage.objects (bucket_id, name, metadata, created_at) values ($1, $2, jsonb_build_object('size', $3::bigint), now() - make_interval(mins => $4))`, [bucket, name, size, ageMinutes]);
  // a ready, active Intro for owner A (as the accepted worker completion leaves it)
  const intro = async (job, { owner = A, profile = PA, durationMs = 8000 } = {}) => {
    const derivative = `${owner}/${job}/intro-d3.webm`;
    await object("intro-media", derivative, 3_000_000);
    await db.query(`insert into public.intro_processing_jobs (job_id, profile_id, owner_user_id, state, requested_transition, source_path, source_mime, source_size_bytes, source_duration_ms,
      derivative_path, output_size_bytes, output_duration_ms, output_width, output_height, output_fps, output_has_audio)
      values ($1, $2, $3, 'ready', 'fade', $4, 'video/mp4', 1000, $5, $6, 3000000, $5, 1920, 1080, 30, true)`, [job, profile, owner, `${owner}/${job}/source.mp4`, durationMs, derivative]);
    await db.query(`insert into public.profile_intro_settings (profile_id, active_job_id) values ($1, $2) on conflict (profile_id) do update set active_job_id = excluded.active_job_id`, [profile, job]);
  };
  const select = async (job, ms) => { await as(A); try { return await one(`select * from public.set_my_intro_thumbnail($1, $2)`, [job, ms]); } finally { await as(null); } };
  const mine = async () => { await as(A); try { return await one(`select * from public.get_my_intro_thumbnail()`); } finally { await as(null); } };
  const claim = () => one(`select * from public.worker_claim_intro_share()`);
  const complete = async (c, { bytes = 3_100_000, w = 1920, h = 1080, ms = 8033 } = {}) => {
    await object("intro-share-copies", c.share_path, bytes);
    return one(`select * from public.worker_complete_intro_share($1, $2, $3, $4, $5, $6, $7)`, [c.share_id, c.claim_token, c.share_path, bytes, w, h, ms]);
  };
  const publicShare = async (handle = "alpha") => (await one(`select * from public.get_public_intro_share($1)`, [handle])) ?? null;
  const readable = async path => (await one(`select private.intro_share_is_public($1) ok`, [path])).ok;
  const fails = async (promise, code) => { await assert.rejects(promise, error => { assert.match(String(error.message), new RegExp(code)); return true; }); };
  return { db, one, as, object, intro, select, mine, claim, complete, publicShare, readable, fails };
}

test("selection: only the owner's ACTIVE ready Intro, within its duration; the default (0 / null) needs no share copy", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.fails(f.select(J2, 5000), "INTRO_THUMBNAIL_INTRO_CHANGED");
  await f.fails(f.select(J1, 8000), "INVALID_INTRO_THUMBNAIL");
  await f.fails(f.select(J1, -1), "INVALID_INTRO_THUMBNAIL");
  await f.fails(f.one(`select * from public.set_my_intro_thumbnail($1, 5000)`, [J1]), "NOT_AUTHORIZED");   // no session
  assert.deepEqual(await f.select(J1, 0), { thumbnail_ms: null, share_state: null });
  assert.equal((await f.one("select count(*)::int n from public.intro_share_copies")).n, 0);
  const none = await f.mine();
  assert.equal(none.job_id, J1);
  assert.equal(none.thumbnail_ms, null);
  assert.equal(none.intro_duration_ms, 8000);
});

test("queue: a frame queues ONE share copy (dispatch names the new table); the same frame again is idempotent; a new frame supersedes it", async () => {
  const f = await fixture();
  await f.intro(J1);
  assert.deepEqual(await f.select(J1, 5000), { thumbnail_ms: 5000, share_state: "pending" });
  assert.equal((await f.one("select body ->> 'table' t from net.calls")).t, "intro_share_copies");
  assert.deepEqual(await f.select(J1, 5000), { thumbnail_ms: 5000, share_state: "pending" });
  assert.equal((await f.one("select count(*)::int n from public.intro_share_copies")).n, 1, "an unchanged frame never queues a second copy");
  await f.select(J1, 2500);
  const rows = (await f.db.query("select thumbnail_ms, state from public.intro_share_copies order by created_at, thumbnail_ms desc")).rows;
  assert.deepEqual(rows.map(r => [r.thumbnail_ms, r.state]).sort(), [[2500, "pending"], [5000, "superseded"]]);
  const saved = await f.mine();
  assert.equal(saved.thumbnail_ms, 2500);
  assert.equal(saved.share_state, "pending");
});

test("worker: claim -> complete makes the copy public for a PUBLIC GamID only; the claim carries the derivative and the exact object path", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.select(J1, 5000);
  const c = await f.claim();
  assert.equal(c.derivative_path, `${A}/${J1}/intro-d3.webm`);
  assert.equal(c.thumbnail_ms, 5000);
  assert.equal(c.intro_duration_ms, 8000);
  assert.match(c.share_path, new RegExp(`^${A}/${J1}/${c.share_id}/[0-9a-f-]{36}\\.webm$`));
  assert.equal(await f.claim(), undefined, "one claim per copy");
  assert.equal(await f.publicShare(), null, "nothing public before READY");
  await f.fails(f.one(`select * from public.worker_complete_intro_share($1, gen_random_uuid(), $2, 1, 1920, 1080, 8033)`, [c.share_id, c.share_path]), "INTRO_SHARE_NOT_CLAIMED");
  await f.fails(f.complete(c, { w: 1280, h: 720 }), "INTRO_SHARE_GEOMETRY_CHANGED");
  await f.fails(f.one(`select * from public.worker_complete_intro_share($1, $2, $3, 3100000, 1920, 1080, 12000)`, [c.share_id, c.claim_token, c.share_path]), "INTRO_SHARE_DURATION_CHANGED");
  await f.db.query("delete from storage.objects where bucket_id = 'intro-share-copies'");
  assert.equal((await f.complete(c)).state, "ready");
  assert.deepEqual(await f.publicShare(), { share_path: c.share_path, thumbnail_ms: 5000 });
  assert.equal(await f.readable(c.share_path), true);
  assert.equal((await f.mine()).share_state, "ready");
  await f.db.query(`update public.entities set visibility = 'PRIVATE' where entity_id = $1`, [EA]);
  assert.equal(await f.publicShare(), null, "a PRIVATE GamID exposes no copy");
  assert.equal(await f.readable(c.share_path), false);
});

test("a superseded or replaced selection is never served: frame change, reset to default, Intro replacement and Intro removal", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.select(J1, 5000);
  const first = await f.claim();
  await f.complete(first);
  // the owner picks another frame: the ready copy stops being served at once, before the new one is ready
  await f.select(J1, 1200);
  assert.equal(await f.publicShare(), null);
  assert.equal(await f.readable(first.share_path), false);
  const second = await f.claim();
  // a superseded in-flight attempt can never complete
  await f.select(J1, 3000);
  await f.fails(f.complete(second), "INTRO_SHARE_NOT_CLAIMED");
  const third = await f.claim();
  assert.equal(third.thumbnail_ms, 3000);
  await f.complete(third);
  assert.equal((await f.publicShare()).share_path, third.share_path);
  // back to the default first frame
  await f.select(J1, null);
  assert.equal(await f.publicShare(), null);
  assert.equal((await f.mine()).thumbnail_ms, null);
  // a new frame, then the Intro is REPLACED (the accepted worker completion moves active_job_id): the old selection is void, nothing is served
  await f.select(J1, 4000);
  const fourth = await f.claim();
  await f.complete(fourth);
  await f.intro(J2);
  assert.equal(await f.publicShare(), null);
  const fresh = await f.mine();
  assert.equal(fresh.job_id, J2);
  assert.equal(fresh.thumbnail_ms, null, "the new Intro starts at its default frame");
  await f.fails(f.select(J1, 4000), "INTRO_THUMBNAIL_INTRO_CHANGED");
  // a copy still queued for the old Intro is superseded at claim time instead of being made
  await f.select(J2, 2000);
  await f.db.query(`update public.profile_intro_settings set active_job_id = null where profile_id = $1`, [PA]);   // remove_my_intro's effect
  assert.equal(await f.claim(), undefined);
  assert.equal((await f.one("select state from public.intro_share_copies where job_id = $1 and thumbnail_ms = 2000", [J2])).state, "superseded");
  assert.equal(await f.publicShare(), null);
});

test("sweep: every share object that is not the current READY copy or the in-flight attempt, after the grace period", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.select(J1, 5000);
  const kept = await f.claim();
  await f.complete(kept);
  await f.db.query(`update storage.objects set created_at = now() - interval '1 hour' where name = $1`, [kept.share_path]);
  await f.object("intro-share-copies", `${A}/${J1}/orphan/old.webm`, 10, 30);
  await f.object("intro-share-copies", `${A}/${J1}/orphan/new.webm`, 10, 1);
  const sweep = async () => (await f.db.query("select object_path from public.worker_intro_share_sweep(20)")).rows.map(r => r.object_path).sort();
  assert.deepEqual(await sweep(), [`${A}/${J1}/orphan/old.webm`]);
  await f.select(J1, 1000);
  const inflight = await f.claim();
  await f.object("intro-share-copies", inflight.share_path, 10, 30);
  assert.deepEqual(await sweep(), [kept.share_path, `${A}/${J1}/orphan/old.webm`].sort(), "the superseded ready copy goes; the in-flight attempt stays");
});

test("quota: the share copy never counts toward the owner's storage; the Intro derivative still does", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.object("intro-share-copies", `${A}/${J1}/x/y.webm`, 5_000_000);
  assert.equal(Number((await f.one(`select private.usage_stored_bytes($1) n`, [A])).n), 3_000_000);
  await f.as(A);
  assert.deepEqual((await f.one(`select private.get_my_usage_impl() u`)).u, { "intro-media": 3000000 });
});

test("abuse bound: at most 20 share copies per profile per hour", async () => {
  const f = await fixture();
  await f.intro(J1);
  for (let ms = 1; ms <= 20; ms += 1) await f.select(J1, ms * 100);
  await f.fails(f.select(J1, 2500), "INTRO_THUMBNAIL_RATE_LIMITED");
  assert.equal((await f.mine()).thumbnail_ms, 2000, "a refused change keeps the saved frame");
});

test("privileges: owners get only their own selection RPCs; visitors only the lookup; worker RPCs are service-role only", async () => {
  const f = await fixture();
  const can = async (role, fn) => (await f.one(`select has_function_privilege($1, $2, 'execute') ok`, [role, fn])).ok;
  for (const fn of ["public.get_my_intro_thumbnail()", "public.set_my_intro_thumbnail(uuid, integer)"]) {
    assert.equal(await can("authenticated", fn), true);
    assert.equal(await can("anon", fn), false);
  }
  assert.equal(await can("anon", "public.get_public_intro_share(text)"), true);
  for (const fn of ["public.worker_claim_intro_share()", "public.worker_complete_intro_share(uuid, uuid, text, bigint, integer, integer, integer)",
    "public.worker_fail_intro_share(uuid, uuid, text)", "public.worker_intro_share_sweep(integer)"]) {
    assert.equal(await can("service_role", fn), true);
    assert.equal(await can("authenticated", fn), false);
    assert.equal(await can("anon", fn), false);
  }
  assert.equal((await f.one(`select has_table_privilege('anon', 'public.intro_share_copies', 'select') ok`)).ok, false);
  assert.equal((await f.one(`select has_table_privilege('authenticated', 'public.intro_share_copies', 'select') ok`)).ok, false);
  const bucket = await f.one(`select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'intro-share-copies'`);
  assert.deepEqual(bucket, { public: false, file_size_limit: 15728640, allowed_mime_types: ["video/webm"] });
});
