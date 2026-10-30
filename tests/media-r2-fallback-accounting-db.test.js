// Architecture F pilot fixes (Mazen's task 2026-10-30, handoff §149): fallback accounting (a missing source is never counted; a request is counted by its
// clamped range) and the Discord share copy's READY invariant (the sweep never leaves a READY row without its object). The REAL migrations - Slice 3C,
// the public Intro read, Intro Thumbnail for Discord, the R2 pilot and this fix - in an isolated PGlite Postgres; Supabase's own pieces are stubs.
// Concurrency (two sessions racing for the budget) needs real connections: it is exercised live on TESTING (§149), not here.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const FIX = read("supabase/migrations/20261030120000_media_r2_fallback_accounting.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const PA = "aaaaaaaa-0000-4000-8000-00000000000a", PB = "bbbbbbbb-0000-4000-8000-00000000000b";
const J1 = "00000001-0000-4000-8000-000000000001", J2 = "00000002-0000-4000-8000-000000000002";
const SIZE = 3_000_000, DAY = 104857600;

async function fixture({ applyFix = true } = {}) {
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
    insert into public.entities values ('${EA}', 'SOLO', 'gm_test_01', 'PUBLIC'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles values ('${PA}', '${EA}'), ('${PB}', '${EB}');
    create function private.usage_stored_bytes(u uuid) returns bigint language sql stable as $$
      select coalesce(sum((o.metadata->>'size')::bigint), 0)::bigint from storage.objects o where split_part(o.name,'/',1)=u::text and o.bucket_id<>'wall-video-renditions' $$;
    create function private.get_my_usage_impl() returns jsonb language sql stable as $$
      select coalesce(jsonb_object_agg(bucket_id, n), '{}') from (select o.bucket_id, sum((o.metadata->>'size')::bigint) n from storage.objects o
      where split_part(o.name,'/',1)=(select auth.uid())::text and o.bucket_id<>'wall-video-renditions' and coalesce(o.metadata->>'size','') ~ '^[0-9]+$' group by 1) x $$;`);
  for (const name of ["20260916170000_slice_3c_intro_identity.sql", "20260918130500_public_profile_intro_media_read.sql", "20261026120000_intro_discord_thumbnail.sql",
    "20261029100000_media_r2_pilot.sql"]) await db.exec(read(`supabase/migrations/${name}`));
  if (applyFix) await db.exec(FIX);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const as = user => db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [user || ""]);
  const object = (bucket, name, size, ageMinutes = 0) => db.query(`insert into storage.objects (bucket_id, name, metadata, created_at) values ($1, $2, jsonb_build_object('size', $3::bigint), now() - make_interval(mins => $4))`, [bucket, name, size, ageMinutes]);
  const intro = async (job, { owner = A, profile = PA } = {}) => {
    const derivative = `${owner}/${job}/intro-d3.webm`;
    await object("intro-media", derivative, SIZE);
    await db.query(`insert into public.intro_processing_jobs (job_id, profile_id, owner_user_id, state, requested_transition, source_path, source_mime, source_size_bytes, source_duration_ms,
      derivative_path, output_size_bytes, output_duration_ms, output_width, output_height, output_fps, output_has_audio)
      values ($1, $2, $3, 'ready', 'fade', $4, 'video/mp4', 1000, 8000, $5, ${SIZE}, 8000, 1920, 1080, 30, true)`, [job, profile, owner, `${owner}/${job}/source.mp4`, derivative]);
    await db.query(`insert into public.profile_intro_settings (profile_id, active_job_id) values ($1, $2) on conflict (profile_id) do update set active_job_id = excluded.active_job_id`, [profile, job]);
    return derivative;
  };
  // the Worker's anonymous crawler lookup, exactly as PostgREST runs it (as anon)
  const lookup = async (bucket, path, range = null, head = false) => {
    await db.query("set role anon");
    try { return (await one(`select mode from public.get_public_media_delivery($1, $2, $3, $4)`, [bucket, path, range, head])).mode; } finally { await db.query("reset role"); }
  };
  const lease = async (bucket, path) => (await one(`select mode from public.public_media_delivery($1, $2)`, [bucket, path])).mode;
  const usage = async () => (await db.query(`select bytes::bigint::text b, leases from private.media_r2_fallback_usage`)).rows.map(r => [Number(r.b), r.leases])[0] ?? [0, 0];
  const select = async (job, ms) => { await as(A); try { return await one(`select * from public.set_my_intro_thumbnail($1, $2)`, [job, ms]); } finally { await as(null); } };
  const claim = () => one(`select * from public.worker_claim_intro_share()`);
  const complete = async c => {
    await object("intro-share-copies", c.share_path, 1_000_000, 30);
    return one(`select * from public.worker_complete_intro_share($1, $2, $3, 1000000, 1920, 1080, 8033)`, [c.share_id, c.claim_token, c.share_path]);
  };
  const publicShare = async (handle = "gm_test_01") => (await one(`select * from public.get_public_intro_share($1)`, [handle])) ?? null;
  const sweep = async () => (await db.query("select object_path from public.worker_intro_share_sweep(20)")).rows.map(r => r.object_path).sort();
  return { db, one, object, intro, lookup, lease, usage, select, claim, complete, publicShare, sweep };
}

test("missing source: the existing storage lookup finds no object -> 'none' (the same 404), never counted, while an existing source is still served", async () => {
  const f = await fixture();
  const intro = await f.intro(J1);
  await f.db.query("update private.media_r2_settings set delivery_enabled = true");
  await f.db.query("delete from storage.objects where name = $1", [intro]);
  assert.equal(await f.lookup("intro-media", intro), "none");
  assert.equal(await f.lease("intro-media", intro), "none");
  assert.deepEqual(await f.usage(), [0, 0], "nothing is charged for a file that cannot be served");
  await f.object("intro-media", intro, SIZE);
  assert.equal(await f.lookup("intro-media", intro), "supabase");
  assert.deepEqual(await f.usage(), [SIZE, 1]);
  // unchanged answers elsewhere: delivery off, a profile outside the pilot, an unpublished identity - none of them is counted
  await f.db.query("update private.media_r2_settings set delivery_enabled = false");
  assert.equal(await f.lookup("intro-media", intro), "supabase");
  await f.db.query("update private.media_r2_settings set delivery_enabled = true");
  const other = await f.intro(J2, { owner: B, profile: PB });
  assert.equal(await f.lookup("intro-media", other), "supabase");
  await f.db.query(`update public.entities set visibility = 'DRAFT' where entity_id = $1`, [EA]);
  assert.equal(await f.lookup("intro-media", intro), "none");
  assert.deepEqual(await f.usage(), [SIZE, 1]);
});

test("range accounting: whole object without a Range, the clamped length of one range, a suffix, nothing for HEAD or an unsatisfiable range; a lease is the whole object", async () => {
  const f = await fixture();
  const intro = await f.intro(J1);
  await f.db.query("update private.media_r2_settings set delivery_enabled = true");
  const expect = async (range, head, bytes, leases) => { assert.equal(await f.lookup("intro-media", intro, range, head), "supabase", `${range} ${head}`); assert.deepEqual(await f.usage(), [bytes, leases], `${range} ${head}`); };
  await expect("bytes=0-9", false, 10, 1);
  await expect("bytes=-500", false, 510, 2);
  await expect(`bytes=${SIZE - 10}-`, false, 520, 3);
  await expect(`bytes=${SIZE - 5}-${SIZE * 2}`, false, 525, 4, "an end past the object is clamped");
  await expect("bytes=-99999999", false, 525 + SIZE, 5);
  await expect("bytes=0-9", true, 525 + SIZE, 5);                  // HEAD: headers only
  await expect(`bytes=${SIZE}-`, false, 525 + SIZE, 5);             // 416: nothing transferred
  await expect("bytes=-0", false, 525 + SIZE, 5);
  await expect(null, false, 525 + 2 * SIZE, 6);                     // no Range
  await expect("bytes=9-3", false, 525 + 3 * SIZE, 7);              // malformed: the server ignores it and sends the whole object
  assert.equal(await f.lease("intro-media", intro), "supabase");
  assert.deepEqual(await f.usage(), [525 + 4 * SIZE, 8], "a lease can download all of it");
});

test("budget: a request is refused (and not recorded) only when its own bytes don't fit; once the day or month is spent even HEAD is refused", async () => {
  const f = await fixture();
  const intro = await f.intro(J1);
  await f.db.query("update private.media_r2_settings set delivery_enabled = true");
  await f.db.query(`insert into private.media_r2_fallback_usage (day, bytes, leases) values ((now() at time zone 'utc')::date, ${DAY - 100}, 1)`);
  assert.equal(await f.lookup("intro-media", intro), "unavailable");
  assert.equal(await f.lookup("intro-media", intro, "bytes=0-99"), "supabase", "the remaining 100 bytes still fit");
  assert.deepEqual(await f.usage(), [DAY, 2]);
  assert.equal(await f.lookup("intro-media", intro, "bytes=0-0"), "unavailable");
  assert.equal(await f.lookup("intro-media", intro, null, true), "unavailable", "HEAD agrees with GET once the budget is spent");
  assert.deepEqual(await f.usage(), [DAY, 2]);
  // the month (the sum of its days) bounds a fresh day too; the limits are the migration's, unchanged
  const charge = (day, bytes) => f.one(`select private.media_r2_fallback_charge($1::date, $2) ok`, [day, bytes]).then(r => r.ok);
  await f.db.query(`insert into private.media_r2_fallback_usage (day, bytes, leases) values ('2000-01-01', ${1073741824 - 10}, 1)`);
  assert.equal(await charge("2000-01-20", 11), false);
  assert.equal(await charge("2000-01-20", 10), true);
  assert.equal(await charge("2000-02-01", DAY), true, "a new month starts again");
  assert.deepEqual((await f.one(`select fallback_daily_bytes::text d, fallback_monthly_bytes::text m from private.media_r2_settings`)), { d: String(DAY), m: "1073741824" });
});

test("privileges: anon reaches only the delivery decision; the range and charge helpers are callable by no client role; the sweep stays service-only", async () => {
  const f = await fixture();
  const can = async (role, fn) => (await f.one(`select has_function_privilege($1, $2, 'execute') ok`, [role, fn])).ok;
  assert.equal(await can("anon", "public.get_public_media_delivery(text, text, text, boolean)"), true);
  for (const role of ["anon", "authenticated", "service_role"]) {
    assert.equal(await can(role, "private.media_r2_fallback_charge(date, bigint)"), false, role);
    assert.equal(await can(role, "private.media_r2_range_bytes(bigint, text, boolean)"), false, role);
  }
  for (const role of ["anon", "authenticated"]) {
    assert.equal(await can(role, "public.public_media_delivery(text, text)"), false, role);
    assert.equal(await can(role, "public.worker_intro_share_sweep(integer)"), false, role);
  }
  assert.equal(await can("service_role", "public.public_media_delivery(text, text)"), true);
  assert.equal(await can("service_role", "public.worker_intro_share_sweep(integer)"), true);
  assert.equal((await f.one(`select count(*)::int n from pg_proc where proname in ('get_public_media_delivery', 'public_media_delivery', 'media_r2_delivery_impl')`)).n, 3, "no stale overload");
});

test("Discord share copy: a READY copy that stops being current is superseded by the sweep that deletes its object, so it can never come back READY without a file", async () => {
  const f = await fixture();
  await f.intro(J1);
  await f.select(J1, 2000);
  const copy = await f.claim();
  await f.complete(copy);
  assert.equal((await f.publicShare()).share_path, copy.share_path);
  // the selection changes outside the owner RPC (how the TESTING fixture lost its file): the copy is no longer current
  await f.db.query(`update public.profile_intro_settings set thumbnail_ms = 1000 where profile_id = $1`, [PA]);
  assert.deepEqual(await f.sweep(), [copy.share_path], "its object is listed for deletion");
  assert.equal((await f.one(`select state from public.intro_share_copies where share_id = $1`, [copy.share_id])).state, "superseded", "and its row is no longer READY");
  await f.db.query(`delete from storage.objects where name = $1`, [copy.share_path]);   // the worker deletes what the sweep listed
  // the selection comes back: nothing READY points at the deleted file; Discord gets the unchanged Intro and the owner's frame is prepared again
  await f.db.query(`update public.profile_intro_settings set thumbnail_ms = 2000 where profile_id = $1`, [PA]);
  assert.equal(await f.publicShare(), null);
  assert.deepEqual(await f.select(J1, 2000), { thumbnail_ms: 2000, share_state: "pending" });
  // the current READY copy and the in-flight attempt are kept, as before
  const next = await f.claim();
  await f.complete(next);
  assert.deepEqual(await f.sweep(), []);
  assert.equal((await f.publicShare()).share_path, next.share_path);
});

test("one-time repair: a READY copy whose object is gone is superseded and its current frame queued again; healthy copies and stale selections are left alone", async () => {
  const f = await fixture({ applyFix: false });
  await f.intro(J1);
  await f.select(J1, 2000);
  const broken = await f.complete(await f.claim()).then(() => f.one(`select share_id, share_path from public.intro_share_copies where state = 'ready'`));
  await f.db.query(`delete from storage.objects where name = $1`, [broken.share_path]);
  await f.intro(J2, { owner: B, profile: PB });
  await f.db.query(`select set_config('request.jwt.claim.sub', $1, false)`, [B]);
  await f.one(`select * from public.set_my_intro_thumbnail($1, 3000)`, [J2]);
  await f.db.query(`select set_config('request.jwt.claim.sub', '', false)`);
  const healthy = await f.claim();
  await f.complete(healthy);
  await f.db.query("delete from net.calls");
  await f.db.exec(FIX);
  const rows = (await f.db.query(`select profile_id, job_id, thumbnail_ms, state from public.intro_share_copies order by created_at`)).rows.map(r => [r.profile_id, r.thumbnail_ms, r.state]);
  assert.deepEqual(rows, [[PA, 2000, "superseded"], [PB, 3000, "ready"], [PA, 2000, "pending"]]);
  assert.equal((await f.one("select count(*)::int n from net.calls where body ->> 'table' = 'intro_share_copies'")).n, 1, "the new copy is dispatched to the worker");
  assert.equal((await f.publicShare("bravo")).share_path, healthy.share_path, "another owner's healthy copy is untouched");
});
