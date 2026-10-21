// F8-B1 (Mazen's authorization 2026-10-21): the internal visitor rendition registry, queue, gate, visitor manifest, lease predicate, sweep and quota exclusion -
// the REAL migration (20261021120000_video_renditions_f8b1.sql) on top of the REAL accepted published-media predicate and visitor manifest
// (20261009170000_wall_public_publishing_toggle.sql), in an isolated PGlite Postgres. Supabase's own pieces (storage tables, auth.uid(), Vault, pg_net) are stubs.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const MIGRATION = read("supabase/migrations/20261021120000_video_renditions_f8b1.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ORIGINAL = `${A}/0000000a-0000-4000-8000-000000000001.mp4`, EFFICIENT = `${A}/0000000a-0000-4000-8000-000000000002.mp4`;
const MB = 1024 * 1024;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage; create schema vault; create schema net;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    create table vault.decrypted_secrets (name text, decrypted_secret text);
    create table net.calls (body jsonb);
    create function net.http_post(url text, headers jsonb, body jsonb, timeout_milliseconds integer) returns bigint language sql as $$ insert into net.calls values (body) returning 1 $$;
    insert into vault.decrypted_secrets values ('gamid_intro_dispatch_url_testing', 'https://dispatcher.example'), ('gamid_intro_dispatch_secret_testing', 'fixture-secret');
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create function private.intro_media_is_public(p text) returns boolean language sql stable as $$ select false $$;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.wall_assets (asset_id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.entities(entity_id) on delete cascade, storage_path text not null, mime_type text not null, byte_size integer, width integer, height integer, created_at timestamptz default now());
    create table public.wall_drafts (entity_id uuid primary key, document jsonb);
    create table public.wall_publications (entity_id uuid primary key, document jsonb, draft_revision bigint, published_at timestamptz default now());
    create function private.wall_entity_for_user(candidate_user uuid) returns uuid language sql stable security definer set search_path = '' as $$
      select m.entity_id from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id where m.user_id = candidate_user and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1 $$;
    create function private.wall_owned_entity_id() returns uuid language sql stable security definer set search_path = '' as $$ select private.wall_entity_for_user((select auth.uid())) $$;
    -- the fixture document lists its assets directly (the real validator's extraction is not under test here)
    create function private.wall_document_asset_ids(doc jsonb) returns text[] language sql immutable set search_path = '' as $$ select coalesce(array(select jsonb_array_elements_text(doc -> 'assetIds')), '{}') $$;
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    -- the accepted usage functions this migration replaces (it needs their objects to exist)
    create table private.usage_policy (singleton boolean primary key default true, quota_bytes bigint, approaching numeric, near_limit numeric, gateway_required boolean);
    create table private.usage_media_categories (bucket text primary key, category text not null);
    create function private.usage_reserved_bytes(u uuid) returns bigint language sql as $$ select 0::bigint $$;`);
  // the REAL usage functions as they stand on TESTING: the gateway originals, then the custom-fonts migration's in-place patch (the Custom Fonts quota line)
  const gateway = read("supabase/migrations/20261004170252_global_usage_gateway.sql"), fonts = read("supabase/migrations/20261018120000_wall_custom_fonts.sql");
  const slice = (text, from, to) => { const a = text.indexOf(from); return text.slice(a, text.indexOf(to, a) + to.length); };
  await db.exec(slice(gateway, "create function private.usage_stored_bytes(u uuid)", "\n$$;"));
  await db.exec(slice(gateway, "create function private.get_my_usage_impl()", "end $$;"));
  await db.exec(slice(fonts.slice(fonts.indexOf("-- 9. Usage Center")), "do $$\ndeclare original text; revised text;", "end $$;"));
  await db.exec(read("supabase/migrations/20261009170000_wall_public_publishing_toggle.sql"));
  // the accepted lease predicate before F8-B1 (20261010140000), so the migration's replacement is exercised
  await db.exec(`create function private.public_media_lease_allowed(candidate_bucket text, candidate_path text) returns boolean language sql stable security definer set search_path = '' as $$ select false $$;`);
  await db.exec(MIGRATION);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const object = (bucket, name, size, ageMinutes = 0) => db.query(`insert into storage.objects (bucket_id, name, metadata, created_at) values ($1, $2, jsonb_build_object('size', $3::bigint), now() - make_interval(mins => $4))`, [bucket, name, size, ageMinutes]);
  const asset = async (path, bytes, w, h) => { await object("wall-video", path, bytes); return (await one(`insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height) values ($1, $2, 'video/mp4', $3, $4, $5) returning asset_id`, [EA, path, bytes, w, h])).asset_id; };
  const publish = ids => db.query(`insert into public.wall_publications (entity_id, document, draft_revision) values ($1, $2, 1) on conflict (entity_id) do update set document = excluded.document`, [EA, JSON.stringify({ assetIds: ids })]);
  const queue = (owner, id, bytes, w, h, ms = 11000, frames = 330) => one(`select * from public.create_wall_video_rendition($1, $2, $3, $4, $5, $6, $7)`, [owner, id, bytes, w, h, ms, frames]);
  const claim = () => one(`select * from public.worker_claim_wall_video_rendition()`);
  const complete = (c, bytes, mean = 99.5, p5 = 96.1, w = 1920, h = 1080) => one(`select * from public.worker_complete_wall_video_rendition($1, $2, $3, $4, $5, $6, $7, $8)`, [c.rendition_id, c.claim_token, c.rendition_path, bytes, w, h, mean, p5]);
  const manifest = async () => (await one(`select * from private.get_public_wall_impl('alpha')`))?.assets ?? null;
  const leasable = async path => (await one(`select private.public_media_lease_allowed('wall-video-renditions', $1) ok`, [path])).ok;
  const fails = async (promise, code) => { await assert.rejects(promise, error => { assert.match(String(error.message), new RegExp(code)); return true; }); };
  return { db, one, object, asset, publish, queue, claim, complete, manifest, leasable, fails };
}

test("F8-B1 queue: only an eligible direct H.264 MP4 of this owner, matching the stored object; idempotent; dispatch names the renditions table", async () => {
  const f = await fixture();
  const big = await f.asset(ORIGINAL, 50 * MB - 7, 3840, 2160);
  const queued = await f.queue(A, big, 50 * MB - 7, 3840, 2160);
  assert.equal(queued.state, "pending");
  assert.equal((await f.queue(A, big, 50 * MB - 7, 3840, 2160)).rendition_id, queued.rendition_id, "a retry or a duplicate register call returns the same live rendition");
  assert.equal((await f.one("select count(*)::int n from public.wall_video_renditions")).n, 1);
  assert.equal((await f.one("select body ->> 'table' t from net.calls")).t, "wall_video_renditions");
  // an already-efficient 1080p30 (2.5 Mbit/s) is never queued; a 1080p30 at 12 Mbit/s is (high bitrate)
  const efficient = await f.asset(EFFICIENT, 4 * MB, 1920, 1080);
  await f.fails(f.queue(A, efficient, 4 * MB, 1920, 1080, 14600, 438), "RENDITION_NOT_ELIGIBLE");
  const high = await f.asset(`${A}/0000000a-0000-4000-8000-000000000003.mp4`, 18 * MB, 1920, 1080);
  assert.equal((await f.queue(A, high, 18 * MB, 1920, 1080, 12000, 360)).state, "pending");
  // a portrait 4K counts the same way (either orientation); another owner's asset, a mismatching size or a derivative path is refused
  await f.fails(f.queue(B, big, 50 * MB - 7, 3840, 2160), "WALL_ASSET_NOT_FOUND");
  await f.fails(f.queue(A, efficient, 4 * MB + 1, 1920, 1080), "RENDITION_SOURCE_MISMATCH");
  const derived = (await f.one(`insert into public.wall_assets (entity_id, storage_path, mime_type, byte_size, width, height) values ($1, $2, 'video/mp4', 9, 3840, 2160) returning asset_id`, [EA, `${A}/0000000a-0000-4000-8000-000000000009.h264.mp4`])).asset_id;
  await f.fails(f.queue(A, derived, 9, 3840, 2160), "RENDITION_SOURCE_UNSUPPORTED");
  assert.equal((await f.one("select private.wall_rendition_eligible(2160, 3840, 40000000, 11000, 330) ok")).ok, true);
  assert.equal((await f.one("select private.wall_rendition_eligible(3840, 2160, 40000000, 200000, 12000) ok")).ok, false, "beyond the processing budget (60 s of 4K30)");
});

test("F8-B1 claim + complete: per-attempt token and path; the database re-checks object, size, savings, quality and box; a superseded attempt never completes", async () => {
  const f = await fixture();
  const id = await f.asset(ORIGINAL, 50 * MB - 7, 3840, 2160);
  await f.queue(A, id, 50 * MB - 7, 3840, 2160);
  const c = await f.claim();
  assert.match(c.rendition_path, new RegExp(`^${A}/${c.rendition_id}/${c.claim_token}\\.mp4$`));
  assert.equal(await f.claim(), undefined, "a processing rendition is not claimed twice");
  await f.fails(f.complete({ ...c, claim_token: "99999999-9999-4999-8999-999999999999" }, 13 * MB), "RENDITION_NOT_CLAIMED");
  await f.fails(f.complete(c, 13 * MB), "RENDITION_NOT_FOUND");
  await f.object("wall-video-renditions", c.rendition_path, 13 * MB);
  await f.fails(f.complete(c, 12 * MB), "RENDITION_SIZE_MISMATCH");
  await f.fails(f.complete(c, 13 * MB, 94.9), "QUALITY_GATE");
  await f.fails(f.complete(c, 13 * MB, 99, 89.9), "QUALITY_GATE");
  await f.fails(f.complete(c, 13 * MB, 99.5, 96, 2560, 1440), "RENDITION_TOO_LARGE");
  assert.equal((await f.complete(c, 13 * MB)).state, "ready");
  const row = await f.one("select state, rendition_bytes, vmaf_mean::float m, vmaf_p5::float p, claim_token from public.wall_video_renditions");
  assert.deepEqual([row.state, Number(row.rendition_bytes), row.m, row.p, row.claim_token], ["ready", 13 * MB, 99.5, 96.1, null]);
  // insufficient savings: a candidate more than 75% of the original is refused in the database too
  const id2 = await f.asset(`${A}/0000000a-0000-4000-8000-000000000004.mp4`, 40 * MB, 3840, 2160);
  await f.queue(A, id2, 40 * MB, 3840, 2160);
  const c2 = await f.claim();
  await f.object("wall-video-renditions", c2.rendition_path, 31 * MB);
  await f.fails(f.complete(c2, 31 * MB), "INSUFFICIENT_SAVINGS");
  // a lost worker: reclaimed after 20 minutes with a NEW token and path; the old attempt can no longer finish or complete
  await f.db.query("update public.wall_video_renditions set started_at = now() - interval '21 minutes' where rendition_id = $1", [c2.rendition_id]);
  const again = await f.claim();
  assert.equal(again.rendition_id, c2.rendition_id);
  assert.notEqual(again.claim_token, c2.claim_token);
  assert.notEqual(again.rendition_path, c2.rendition_path);
  await f.fails(f.complete(c2, 31 * MB), "RENDITION_NOT_CLAIMED");
  await f.db.query("select public.worker_finish_wall_video_rendition($1, $2, 'failed', 'LATE', null, null, null)", [c2.rendition_id, c2.claim_token]);
  assert.equal((await f.one("select state from public.wall_video_renditions where rendition_id = $1", [c2.rendition_id])).state, "processing", "the stale attempt changed nothing");
  // the gate's refusal is recorded with its measurements; it is never visible
  await f.db.query("select public.worker_finish_wall_video_rendition($1, $2, 'rejected', 'quality_gate', 93.2, 85.1, 9000000)", [again.rendition_id, again.claim_token]);
  const rejected = await f.one("select state, failure_code, vmaf_mean::float m from public.wall_video_renditions where rendition_id = $1", [again.rendition_id]);
  assert.deepEqual([rejected.state, rejected.failure_code, rejected.m], ["rejected", "QUALITY_GATE", 93.2]);
  await f.fails(f.db.query("select public.worker_finish_wall_video_rendition($1, $2, 'ready', 'x', null, null, null)", [again.rendition_id, again.claim_token]), "INVALID_RENDITION_STATE");
  // at most 2 attempts: a second lost attempt times out as failed
  const id3 = await f.asset(`${A}/0000000a-0000-4000-8000-000000000005.mp4`, 40 * MB, 3840, 2160);
  await f.queue(A, id3, 40 * MB, 3840, 2160);
  await f.claim();
  await f.db.query("update public.wall_video_renditions set started_at = now() - interval '21 minutes', attempts = 2 where asset_id = $1", [id3]);
  assert.equal(await f.claim(), undefined);
  assert.equal((await f.one("select state, failure_code from public.wall_video_renditions where asset_id = $1", [id3])).failure_code, "PROCESSING_TIMED_OUT");
});

test("F8-B1 visitors: the manifest names a rendition only while READY; its lease follows the ORIGINAL's published predicate (PRIVATE, Disable, Unpublish, Delete)", async () => {
  const f = await fixture();
  const id = await f.asset(ORIGINAL, 50 * MB - 7, 3840, 2160);
  await f.publish([id]);
  await f.queue(A, id, 50 * MB - 7, 3840, 2160);
  const c = await f.claim();
  assert.equal((await f.manifest())[0].rendition_path, undefined, "before READY the visitor gets the original only");
  assert.equal(await f.leasable(c.rendition_path), false, "an in-flight object is never leasable");
  await f.object("wall-video-renditions", c.rendition_path, 13 * MB);
  await f.complete(c, 13 * MB);
  const entry = (await f.manifest())[0];
  assert.deepEqual([entry.storage_path, entry.rendition_path], [ORIGINAL, c.rendition_path], "the original stays listed (fallback); the rendition is added");
  assert.equal(await f.leasable(c.rendition_path), true);
  assert.equal(await f.leasable(`${A}/${c.rendition_id}/00000000-0000-4000-8000-000000000000.mp4`), false, "only the exact READY object");
  assert.equal(await f.leasable(`${A}/../x.mp4`), false);
  await f.db.query("update public.entities set visibility = 'PRIVATE' where entity_id = $1", [EA]);
  assert.equal(await f.leasable(c.rendition_path), false, "PRIVATE");
  assert.equal(await f.manifest(), null);
  await f.db.query("update public.entities set visibility = 'PUBLIC' where entity_id = $1", [EA]);
  await f.db.query("update public.wall_publications set is_enabled = false");
  assert.equal(await f.leasable(c.rendition_path), false, "Disable My Wall");
  await f.db.query("update public.wall_publications set is_enabled = true");
  assert.equal(await f.leasable(c.rendition_path), true, "enabled again: the same rendition, no re-encode");
  await f.publish([]);
  assert.equal(await f.leasable(c.rendition_path), false, "republished without the video");
  await f.publish([id]);
  await f.db.query("delete from public.wall_publications");
  assert.equal(await f.leasable(c.rendition_path), false, "unpublished");
  await f.publish([id]);
  assert.equal(await f.leasable(c.rendition_path), true, "republished with it");
  // delete the asset: the rendition is detached, never leasable, never listed, and its object is swept
  await f.db.query("delete from public.wall_assets where asset_id = $1", [id]);
  assert.equal((await f.one("select asset_id from public.wall_video_renditions")).asset_id, null);
  assert.equal(await f.leasable(c.rendition_path), false, "deleted");
  await f.db.query("update storage.objects set created_at = now() - interval '31 minutes'");
  assert.deepEqual((await f.db.query("select * from public.worker_wall_video_rendition_sweep(20)")).rows.map(r => r.object_path), [c.rendition_path]);
});

test("F8-B1 sweep: removes failed, superseded and detached objects after the grace period; never the live READY object or the current attempt", async () => {
  const f = await fixture();
  const id = await f.asset(ORIGINAL, 50 * MB - 7, 3840, 2160);
  await f.queue(A, id, 50 * MB - 7, 3840, 2160);
  const c = await f.claim();
  await f.object("wall-video-renditions", c.rendition_path, 13 * MB, 45);   // the current attempt's upload, old but in flight
  const stray = `${A}/${c.rendition_id}/77777777-7777-4777-8777-777777777777.mp4`;
  await f.object("wall-video-renditions", stray, 13 * MB, 45);              // a crashed earlier attempt no row names
  await f.object("wall-video-renditions", `${A}/${c.rendition_id}/88888888-8888-4888-8888-888888888888.mp4`, 13 * MB, 5);   // too recent: grace
  const sweep = async () => (await f.db.query("select * from public.worker_wall_video_rendition_sweep(20)")).rows.map(r => r.object_path);
  assert.deepEqual(await sweep(), [stray]);
  await f.complete(c, 13 * MB);
  assert.deepEqual(await sweep(), [stray], "the READY object is live");
  // the original replaced underneath (a future migration may change storage_path): the old rendition is no longer live, listed or leasable
  await f.db.query("update public.wall_assets set storage_path = $1 where asset_id = $2", [`${A}/0000000a-0000-4000-8000-0000000000ff.mp4`, id]);
  assert.deepEqual((await sweep()).sort(), [c.rendition_path, stray].sort());
  assert.equal(await f.claim(), undefined);
});

test("F8-B1 quota: the original keeps counting toward the owner's storage; the internal rendition never does", async () => {
  const f = await fixture();
  await f.object("wall-video", ORIGINAL, 50 * MB - 7);
  await f.object("wall-video-renditions", `${A}/aaaaaaaa-0000-4000-8000-000000000001/bbbbbbbb-0000-4000-8000-000000000001.mp4`, 13 * MB);
  assert.equal(Number((await f.one("select private.usage_stored_bytes($1) n", [A])).n), 50 * MB - 7);
  // patched in place: the Usage page media summary skips the bucket AND every later addition (the Custom Fonts quota line) is kept exactly
  const usage = (await f.one("select pg_get_functiondef('private.get_my_usage_impl()'::regprocedure) def")).def;
  assert.match(usage, /split_part\(o\.name,'\/',1\)=u::text and o\.bucket_id<>'wall-video-renditions' and coalesce/, "the Usage page media summary skips it too");
  assert.match(usage, /'key','wall\.fonts','name','Custom Fonts'/, "the live Custom Fonts quota line survives");
  const stored = (await f.one("select pg_get_functiondef('private.usage_stored_bytes(uuid)'::regprocedure) def")).def;
  assert.equal(stored.split("o.bucket_id<>'wall-video-renditions'").length - 1, 2, "both the size check and the sum skip it");
  assert.doesNotMatch(MIGRATION, /create or replace function private\.(usage_stored_bytes|get_my_usage_impl)\b/, "never a copied body that could revert later changes");
  assert.doesNotMatch(MIGRATION, /quota_bytes\s*=|wall_asset_limit\(\)\s*returns|wall_video_limit\(\)\s*returns/, "quota, asset and video limits untouched");
  const bucket = await f.one("select public, file_size_limit, allowed_mime_types from storage.buckets where id = 'wall-video-renditions'");
  assert.deepEqual([bucket.public, Number(bucket.file_size_limit), bucket.allowed_mime_types], [false, 39321600, ["video/mp4"]]);
});

test("F8-B1 privileges: queue and worker RPCs are service-role only; clients get no table, function or storage access", async () => {
  const f = await fixture();
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role};`);
    try {
      await f.fails(f.db.query("select * from public.wall_video_renditions"), "permission denied");
      for (const sql of ["select * from public.worker_claim_wall_video_rendition()", "select * from public.worker_wall_video_rendition_sweep(5)",
        `select * from public.create_wall_video_rendition('${A}', '${A}', 1, 1, 1, 1, 1)`]) await f.fails(f.db.query(sql), "permission denied");
    } finally { await f.db.exec("reset role;"); }
  }
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ""), /create policy/i, "no storage policy: owners and visitors can neither list, read, write nor delete renditions");
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ""), /grant[^;]*\bto\b[^;]*\b(anon|authenticated)\b/i);
  assert.doesNotMatch(MIGRATION.replace(/--.*$/gm, ""), /\b(drop|truncate)\s+(table|schema|function)\b|\bdelete\s+from\b|\bupdate\s+public\.(?!wall_video_renditions)/i, "additive; touches only its own rows");
});
