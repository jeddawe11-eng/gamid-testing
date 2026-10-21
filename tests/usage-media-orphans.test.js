// Universal deletion, safe orphan cleanup (Mazen's approval 2026-10-21): the REAL migration (supabase/migrations/20261022110000_usage_media_orphans.sql) on an
// isolated Postgres (PGlite), after the REAL usage-gateway and custom-fonts migrations whose delete check it patches; plus the gateway's cleanup route with a fake
// backend. Covers: what is and is never an orphan (registered, reserved, recent, in a conversion, another owner's, other buckets, not owned), the grace period,
// bounded tries with back-off, forgetting finished files, the re-check right before deleting, the hardened delete check, Usage bytes, grants, and the route's
// per-file failure isolation.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { handleUsageUpload } from "../supabase/functions/_shared/usage-upload.js";

const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const MIGRATION = read("20261022110000_usage_media_orphans.sql");
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const ENTITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const P = (name, owner = OWNER) => `${owner}/${name}`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema private;create schema storage;create schema auth;create schema realtime;
  grant usage on schema public,private,storage,auth to authenticated,service_role,anon;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
  create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb,created_at timestamptz not null default now(),primary key(bucket_id,name));
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  insert into storage.buckets(id,file_size_limit,allowed_mime_types) values ('avatars',5242880,array['image/webp']),('wall-media',5242880,array['image/png']),('wall-video',52428800,array['video/mp4']),('intro-sources',157286400,array['video/mp4']),('intro-media',15728640,array['video/webm']),('wall-video-derived',209715200,array['video/mp4']),('wall-video-renditions',39321600,array['video/mp4']);
  alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;
  create table public.intro_processing_jobs(source_path text,state text);grant select on public.intro_processing_jobs to authenticated;
  create table public.entities(entity_id uuid primary key,entity_type text,visibility text,gamid_handle text);
  create table public.entity_memberships(entity_id uuid,user_id uuid,role text);
  create table public.wall_drafts(entity_id uuid,document jsonb);
  create table public.wall_publications(entity_id uuid,document jsonb,is_enabled boolean not null default true);
  create table public.wall_assets(asset_id uuid primary key default gen_random_uuid(),entity_id uuid,storage_path text unique,mime_type text);
  create table public.wall_video_jobs(job_id uuid primary key default gen_random_uuid(),source_path text,derivative_path text,state text,source_deleted boolean not null default false,derivative_deleted boolean not null default false);
  create table public.crews(crew_id uuid,name text,owner_entity_id uuid);
  create table public.crew_members(crew_id uuid,entity_id uuid,status text);
  create table public.crew_walls(crew_id uuid,stage_count integer);
  create table private.crew_policy(singleton boolean,max_members integer,wall_stage_allowance integer);insert into private.crew_policy values(true,15,2);
  create function private.crew_wall_stage_allowance(uuid) returns integer language sql as $$ select wall_stage_allowance from private.crew_policy $$;
  create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;`);
  for (const name of ["register_verified_wall_asset_impl", "create_wall_video_job_impl", "worker_complete_wall_video_job_impl", "update_my_identity_profile_impl", "queue_my_intro_impl"])
    await db.exec(`create function private.${name}() returns void language plpgsql as $$declare candidate_owner uuid;caller uuid;begin perform 1 from storage.objects o where o.owner_id = caller::text; if (select 0) >= 60 then raise exception 'WALL_ASSET_LIMIT';end if;if (select 0) >= 10 then raise exception 'WALL_VIDEO_LIMIT';end if;end$$;`);
  await db.exec(read("20261004170252_global_usage_gateway.sql"));
  await db.exec(read("20261018120000_wall_custom_fonts.sql"));   // TESTING's authorize_usage_delete carries this migration's font line
  await db.exec(MIGRATION);
  await db.exec(`insert into public.entities values('${ENTITY}','SOLO','PUBLIC','owner'); insert into public.entity_memberships values('${ENTITY}','${OWNER}','OWNER');`);
  const as = role => db.exec(role === "admin" ? "reset role;" : role === "service" ? "set role service_role;" : `set role authenticated;set request.jwt.claim.sub='${role}';`);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  // an object of `age` minutes, owned through a completed gateway receipt (the gateway writes objects without owner_id) unless told otherwise
  const object = async (bucket, path, { age = 120, owner = OWNER, receipt = "COMPLETE", receiptAge = age, ownerId = null } = {}) => {
    await as("admin");
    await db.query("insert into storage.objects(bucket_id,name,owner_id,metadata,created_at) values($1,$2,$3,'{\"size\":1000}',now()-make_interval(mins=>$4))", [bucket, path, ownerId, age]);
    if (receipt) await db.query("insert into private.usage_uploads(owner_id,bucket,path,expected_bytes,content_type,state,created_at,updated_at) values($1,$2,$3,1000,'video/mp4',$4,now()-make_interval(mins=>$5),now()-make_interval(mins=>$5))", [owner, bucket, path, receipt, receiptAge]);
  };
  const claim = async (owner = OWNER) => { await as("service"); try { return (await one("select public.claim_wall_media_orphans($1) x", [owner])).x.map(o => `${o.bucket}:${o.path}`).sort(); } finally { await as("admin"); } };
  const recheck = async (bucket, path, owner = OWNER) => { await as("service"); try { await db.query("select public.authorize_wall_media_orphan_delete($1,$2,$3)", [owner, bucket, path]); return "ok"; } catch (error) { return String(error.message); } finally { await as("admin"); } };
  return { db, as, one, object, claim, recheck };
}

test("migration shape: additive except one asserted in-place patch; service role only; renditions, Intro, Avatar and font buckets are never considered", () => {
  const code = MIGRATION.replace(/--.*$/gm, "");
  assert.doesNotMatch(code, /create or replace function|\bdrop\b|delete from storage\.objects|52428800/, "no function is replaced except through the asserted patch; no object is deleted by SQL");
  assert.match(MIGRATION, /if revised = original or \(length\(revised\) - length\(original\)\) < 120 then raise exception 'USAGE_MEDIA_ORPHANS_DELETE_PATCH_FAILED'; end if;/);
  assert.match(MIGRATION, /from public, anon, authenticated, service_role;\ngrant execute on function[\s\S]*to service_role;\s*$/);
  const buckets = [...MIGRATION.matchAll(/'(wall-[a-z-]+|intro-[a-z]+|avatars)'/g)].map(m => m[1]);
  assert.deepEqual([...new Set(buckets)].sort(), ["wall-media", "wall-video", "wall-video-derived"]);
});

test("detection: a Wall image / video / converted file whose asset row is gone is an orphan after the 1 h grace - never while registered, recent or reserved", async () => {
  const f = await fixture(); try {
    await f.object("wall-media", P("pic.png"));
    await f.object("wall-video", P("clip.mp4"));
    await f.object("wall-video-derived", P("conv.h264.mp4"), { receipt: null });   // worker-written: no owner receipt, owned by the derived bucket rule
    await f.object("wall-media", P("registered.png"));
    await f.db.query("insert into public.wall_assets(entity_id,storage_path,mime_type) values($1,$2,'image/png')", [ENTITY, P("registered.png")]);
    await f.object("wall-media", P("fresh.png"), { age: 20 });                    // inside the grace period
    await f.object("wall-video", P("receipt-recent.mp4"), { receiptAge: 10 });     // receipt changed in the last hour
    await f.object("wall-video", P("reserved.mp4"), { receipt: "ACTIVE" });        // an upload still reserved
    assert.deepEqual(await f.claim(), [`wall-media:${P("pic.png")}`, `wall-video-derived:${P("conv.h264.mp4")}`, `wall-video:${P("clip.mp4")}`]);
    assert.equal(await f.recheck("wall-media", P("registered.png")), "WALL_ASSET_REGISTERED");
    assert.equal(await f.recheck("wall-media", P("fresh.png")), "NOT_AN_ORPHAN");
    assert.equal(await f.recheck("wall-media", P("pic.png")), "ok");
  } finally { await f.db.close(); }
});

test("protected: conversion sources and in-flight / failed outputs (their own lifecycle), another owner's files, files the owner does not own, other buckets", async () => {
  const f = await fixture(); try {
    await f.object("wall-video", P("hevc-source.mov.mp4"));
    await f.object("wall-video-derived", P("pending.h264.mp4"), { receipt: null });
    await f.object("wall-video-derived", P("failed.h264.mp4"), { receipt: null });
    await f.object("wall-video-derived", P("ready-deleted-asset.h264.mp4"), { receipt: null });
    await f.object("wall-video", P("source-already-deleted.mp4"));
    await f.db.query(`insert into public.wall_video_jobs(source_path,derivative_path,state,source_deleted,derivative_deleted) values
      ($1,$2,'processing',false,false), ($5,$3,'failed',true,false), ($6,$4,'ready',true,false)`,
      [P("hevc-source.mov.mp4"), P("pending.h264.mp4"), P("failed.h264.mp4"), P("ready-deleted-asset.h264.mp4"), P("source-x.mp4"), P("source-already-deleted.mp4")]);
    await f.object("wall-media", P("theirs.png", OTHER), { owner: OTHER });
    await f.object("wall-media", P("not-mine.png"), { receipt: null });          // no receipt, no owner_id: not provably the owner's
    await f.object("wall-media", P("legacy.png"), { receipt: null, ownerId: OWNER });   // an older direct upload with owner_id: the owner's
    for (const bucket of ["avatars", "intro-sources", "intro-media", "wall-fonts", "wall-video-renditions"]) await f.object(bucket, P(`x-${bucket}`), { receipt: null, ownerId: OWNER });
    assert.deepEqual(await f.claim(), [`wall-media:${P("legacy.png")}`, `wall-video-derived:${P("ready-deleted-asset.h264.mp4")}`, `wall-video:${P("source-already-deleted.mp4")}`],
      "only: a READY conversion's output whose asset was deleted, a source its lifecycle already marked deleted, and the owner's legacy file");
    assert.deepEqual(await f.claim(OTHER), [`wall-media:${P("theirs.png", OTHER)}`], "each owner only ever gets their own");
    assert.equal(await f.recheck("wall-media", P("theirs.png", OTHER)), "UPLOAD_NOT_OWNED", "never another owner's file");
    assert.equal(await f.recheck("avatars", P("x-avatars")), "NOT_AN_ORPHAN");
    assert.equal(await f.recheck("wall-video", P("hevc-source.mov.mp4")), "NOT_AN_ORPHAN");
  } finally { await f.db.close(); }
});

test("bounded tries: each claim is recorded; back-off of 15 minutes; at most 5 tries; at most 10 per run; a finished file is forgotten; Usage bytes follow", async () => {
  const f = await fixture(); try {
    for (let i = 0; i < 12; i += 1) await f.object("wall-media", P(`many-${String(i).padStart(2, "0")}.png`), { age: 200 - i });
    const first = await f.claim();
    assert.equal(first.length, 10, "at most 10 a run");
    const second = await f.claim();
    assert.deepEqual(second, [`wall-media:${P("many-10.png")}`, `wall-media:${P("many-11.png")}`], "the rest; the first ten wait for their back-off");
    assert.deepEqual(await f.claim(), [], "nothing is taken twice within 15 minutes (two cleanups cannot race for a file)");
    await f.db.query("update private.usage_media_orphan_attempts set last_attempt_at = now() - interval '20 minutes' where path = $1", [P("many-00.png")]);
    assert.deepEqual(await f.claim(), [`wall-media:${P("many-00.png")}`]);
    assert.equal((await f.one("select attempts from private.usage_media_orphan_attempts where path = $1", [P("many-00.png")])).attempts, 2);
    await f.db.query("update private.usage_media_orphan_attempts set attempts = 5, last_attempt_at = now() - interval '1 day' where path = $1", [P("many-00.png")]);
    assert.deepEqual(await f.claim(), [], "after 5 tries a file is no longer tried (it stays visible in Usage)");
    const before = Number((await f.one("select private.usage_stored_bytes($1) n", [OWNER])).n);
    await f.db.query("delete from storage.objects where name = $1", [P("many-01.png")]);   // the gateway's delete succeeded
    await f.claim();
    assert.equal((await f.one("select count(*)::int n from private.usage_media_orphan_attempts where path = $1", [P("many-01.png")])).n, 0, "a finished file is forgotten");
    assert.equal(Number((await f.one("select private.usage_stored_bytes($1) n", [OWNER])).n), before - 1000, "Usage counts exactly what is still stored");
  } finally { await f.db.close(); }
});

test("the re-check right before deleting: a file registered (or reserved) after it was claimed is kept; the hardened delete check keeps registered files from every caller", async () => {
  const f = await fixture(); try {
    await f.object("wall-media", P("late.png"));
    assert.deepEqual(await f.claim(), [`wall-media:${P("late.png")}`]);
    await f.db.query("insert into public.wall_assets(entity_id,storage_path,mime_type) values($1,$2,'image/png')", [ENTITY, P("late.png")]);
    assert.equal(await f.recheck("wall-media", P("late.png")), "WALL_ASSET_REGISTERED");
    await f.as("service");
    await assert.rejects(f.db.query("select public.authorize_usage_delete($1,'wall-media',$2)", [OWNER, P("late.png")]), /WALL_ASSET_REGISTERED/, "the gateway's ordinary DELETE route refuses it too");
    await f.as("admin");
    await f.db.query("delete from public.wall_assets where storage_path = $1", [P("late.png")]);
    await f.as("service");
    await f.db.query("select public.authorize_usage_delete($1,'wall-media',$2)", [OWNER, P("late.png")]);   // the universal deletion's own file delete (row first) still works
    const def = (await f.one("select pg_get_functiondef('private.authorize_usage_delete(uuid,text,text)'::regprocedure) d")).d;
    assert.match(def, /WALL_FONT_REGISTERED[\s\S]*INTRO_PROCESSING_IN_PROGRESS/, "the existing font and Intro protections are kept");
    await f.as("admin");
  } finally { await f.db.close(); }
});

test("grants: clients can neither list orphans nor authorize deletes; only the gateway's service role can", async () => {
  const f = await fixture(); try {
    await f.object("wall-media", P("pic.png"));
    await f.as(OWNER);
    await assert.rejects(f.db.query("select public.claim_wall_media_orphans($1)", [OWNER]), /permission denied/);
    await assert.rejects(f.db.query("select public.authorize_wall_media_orphan_delete($1,'wall-media',$2)", [OWNER, P("pic.png")]), /permission denied/);
    await assert.rejects(f.db.query("select * from private.usage_media_orphan_attempts"), /permission denied/);
    await f.as("admin");
    assert.equal((await f.claim()).length, 1);
  } finally { await f.db.close(); }
});

// ---- the gateway route ---------------------------------------------------------------------------------------------------------------------------------
const BASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const env = { supabaseUrl: BASE, serviceKey: "private-service-fixture", anonKey: "publishable-fixture" };
const json = (v, s = 200) => new Response(JSON.stringify(v), { status: s, headers: { "Content-Type": "application/json" } });
function gateway({ orphans = [], refuse = () => null, storageFails = () => false } = {}) {
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, method: options.method, body: options.body && typeof options.body === "string" ? JSON.parse(options.body) : null });
    if (url.endsWith("/auth/v1/user")) return json({ id: OWNER });
    if (url.includes("/rpc/")) {
      const name = url.split("/").at(-1), b = JSON.parse(options.body || "{}");
      if (name === "usage_gateway_probe") return json({}, 403);
      if (name === "claim_wall_media_orphans") return json(orphans);
      if (name === "authorize_wall_media_orphan_delete") { const refusal = refuse(b); return refusal ? json({ message: refusal }, 400) : new Response(null, { status: 204 }); }
      if (name === "usage_cleanup_candidates" || name === "usage_intro_cleanup_candidates" || name === "usage_font_orphans") return json([]);
      return new Response(null, { status: 204 });
    }
    if (url.includes("/storage/v1/object/") && options.method === "DELETE") return storageFails(url) ? json({ error: "x" }, 500) : json({});
    throw Error(`unexpected ${url}`);
  };
  const run = () => handleUsageUpload({ request: new Request(`${BASE}/functions/v1/usage-upload/cleanup`, { method: "POST", headers: { apikey: env.anonKey, Authorization: "Bearer owner" } }), env, fetchImpl });
  return { run, calls, deletes: () => calls.filter(c => c.method === "DELETE").map(c => c.url.replace(`${BASE}/storage/v1/object/`, "")) };
}

test("route: the owner's existing cleanup deletes claimed orphans through the re-check; one refusal or storage failure never stops the others; foreign paths stop everything", async () => {
  const orphans = [{ bucket: "wall-media", path: P("a.png") }, { bucket: "wall-video", path: P("b.mp4") }, { bucket: "wall-video-derived", path: P("c.h264.mp4") }];
  const g = gateway({ orphans, refuse: b => (b.candidate_path === P("b.mp4") ? "NOT_AN_ORPHAN" : null), storageFails: url => url.includes("c.h264.mp4") });
  const r = await g.run();
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { cleaned: 0, intro: 0, fonts: 0, media: 1, mediaFailed: 2 });
  assert.deepEqual(g.deletes(), [`wall-media/${P("a.png")}`, `wall-video-derived/${P("c.h264.mp4")}`], "the refused file is never deleted");
  assert.deepEqual(g.calls.filter(c => c.url.endsWith("/authorize_wall_media_orphan_delete")).map(c => c.body.candidate_path), orphans.map(o => o.path), "each one re-checked first");
  assert.ok(g.calls.some(c => c.url.endsWith("/signal_usage_changed")), "Usage is told");
  for (const bad of [{ bucket: "wall-media", path: P("x.png", OTHER) }, { bucket: "avatars", path: P("x.webp") }, { bucket: "wall-media", path: `${OWNER}/../x.png` }]) {
    const foreign = gateway({ orphans: [bad] });
    assert.notEqual((await foreign.run()).status, 200);
    assert.equal(foreign.deletes().length, 0, `${bad.bucket}:${bad.path}`);
  }
  const none = gateway();
  assert.deepEqual(await (await none.run()).json(), { cleaned: 0, intro: 0, fonts: 0, media: 0, mediaFailed: 0 });
  assert.equal(none.calls.some(c => c.url.endsWith("/signal_usage_changed")), false);
});

test("trigger: the Wall editor runs the owner's cleanup when it opens (as Usage does), never blocking the editor", () => {
  const editor = readFileSync(new URL("../dist/wall-editor/editor.js", import.meta.url), "utf8");
  assert.match(editor, /Promise\.resolve\(api\.reconcileUsageUploads\?\.\(\)\)\.catch\(\(\) => \{/);
});
