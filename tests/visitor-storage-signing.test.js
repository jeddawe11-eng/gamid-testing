// Phase 1D (ISS-0009): visitors cannot sign Storage objects; only owners can. The real accepted Avatar read policies + the real Banner migrations + the new
// migration in an isolated PGlite Postgres. storage.operation() is stubbed exactly as Supabase defines it (current_setting('storage.operation')), with the
// operation names observed live on TESTING (storage.object.sign / storage.object.sign_many / storage.object.get_authenticated).
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261010140000_visitor_storage_signing.sql") + "\n" + read("supabase/migrations/20261010141000_visitor_storage_signing_ban.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const AVATAR = `${A}/avatar-0000000a-0000-4000-8000-00000000000f.webp`, BANNER = `${A}/banner/0000000a-0000-4000-8000-000000000001.jpg`;
const INTRO = `${A}/0000000a-0000-4000-8000-000000000003/intro-d3.webm`, WALL = `${A}/0000000a-0000-4000-8000-000000000004.webm`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.operation() returns text language plpgsql stable as $$ begin return current_setting('storage.operation', true); end; $$;
    grant execute on function auth.uid(), storage.operation() to anon, authenticated, service_role;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text, avatar_media_reference text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC', '${AVATAR}'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC', null);
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    alter table storage.objects enable row level security;
    grant select on storage.objects to anon, authenticated;
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and x.owner_id = u and x.state = 'COMPLETE') $$;
    grant execute on function private.usage_object_owned(text, text, uuid) to authenticated;
    create policy owner_receipt_read on storage.objects for select to authenticated using (private.usage_object_owned(bucket_id, name, (select auth.uid())));
    -- the accepted Intro / Wall predicates (stubs with the same signatures), driven by a fixture table
    create table private.fixture_public (bucket text, path text);
    create function private.intro_media_is_public(p text) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from private.fixture_public f where f.bucket = 'intro-media' and f.path = p) $$;
    create function private.wall_object_is_published(b text, p text) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from private.fixture_public f where f.bucket = b and f.path = p) $$;
    grant execute on function private.intro_media_is_public(text), private.wall_object_is_published(text, text) to anon, authenticated;
    create policy intro_public on storage.objects for select to anon, authenticated using (bucket_id = 'intro-media' and private.intro_media_is_public(name));
    create policy wall_public on storage.objects for select to anon, authenticated using (bucket_id in ('wall-video', 'wall-video-derived') and private.wall_object_is_published(bucket_id, name));`);
  for (const f of ["20260918121000_public_profile_avatar_read.sql", "20260918122000_public_profile_avatar_policy_fix.sql", "20261010120000_profile_banner.sql", "20261010130000_profile_banner_read_containment.sql"]) await db.exec(read(`supabase/migrations/${f}`));
  await db.exec(migration);
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('avatars', $1, '{"mimetype":"image/webp","size":1000}'), ('avatars', $2, '{"mimetype":"image/jpeg","size":30000}'), ('intro-media', $3, '{}'), ('wall-video', $4, '{}')`, [AVATAR, BANNER, INTRO, WALL]);
  await db.query(`insert into private.usage_uploads values ('avatars', $1, $3, 'COMPLETE'), ('avatars', $2, $3, 'COMPLETE')`, [AVATAR, BANNER, A]);
  await db.query(`insert into private.fixture_public values ('intro-media', $1), ('wall-video', $2)`, [INTRO, WALL]);
  const sees = async (uid, op, path) => {
    await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
    await db.query("select set_config('storage.operation', $1, false)", [op ?? ""]);
    try { return (await db.query("select name from storage.objects where name = $1", [path])).rows.length === 1; }
    finally { await db.exec("reset role;"); await db.query("select set_config('storage.operation', '', false)"); }
  };
  const service = async (sql, params = []) => { await db.exec("set role service_role;"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  return { db, sees, service };
}

test("visitors can still READ public media directly (every read re-checks RLS) but can no longer SIGN it - Avatar, Intro, Wall video", async () => {
  const f = await fixture();
  for (const path of [AVATAR, INTRO, WALL]) {
    assert.equal(await f.sees(null, "storage.object.get_authenticated", path), true, `${path}: anonymous direct read unchanged`);
    assert.equal(await f.sees(null, "object.get_authenticated_info", path), true);
    for (const op of ["storage.object.sign", "storage.object.sign_many"]) {
      assert.equal(await f.sees(null, op, path), false, `${op} refused for anon`);
      assert.equal(await f.sees(B, op, path), false, `${op} refused for another signed-in user`);
    }
  }
});

test("owners keep signing their own objects (Intro preview, Wall editor, their Banner)", async () => {
  const f = await fixture();
  for (const path of [AVATAR, BANNER, INTRO, WALL]) assert.equal(await f.sees(A, "storage.object.sign", path), true, path);
  assert.equal(await f.sees(B, "storage.object.sign", BANNER), false);
  assert.equal(await f.sees(null, "storage.object.sign", BANNER), false, "the Banner stays unreadable and unsignable for visitors");
});

test("the restrictive rule narrows only signing; Avatar visibility rules are unchanged (PRIVATE still hides it)", async () => {
  const f = await fixture();
  await f.db.exec(`update public.entities set visibility = 'PRIVATE' where entity_id = '${EA}'`);
  assert.equal(await f.sees(null, "storage.object.get_authenticated", AVATAR), false);
  const restrictive = (await f.db.query("select policyname, permissive, roles::text r, qual from pg_policies where tablename = 'objects' and policyname = 'only owners can sign storage objects'")).rows;
  assert.equal(restrictive.length, 1); assert.equal(restrictive[0].permissive, "RESTRICTIVE"); assert.match(restrictive[0].r, /anon/); assert.match(restrictive[0].r, /authenticated/);
  assert.doesNotMatch(migration.replace(/--.*$/gm, ""), /drop policy|alter policy|avatar_is_public|create (or replace )?function private\.(intro_media_is_public|wall_object_is_published)/i, "accepted read policies and predicates untouched");
});

test("public_media_lease_allowed: the accepted predicates decide; other buckets and dot segments never; service role only", async () => {
  const f = await fixture();
  const allowed = async (b, p) => (await f.service("select public.public_media_lease_allowed($1, $2) ok", [b, p]))[0].ok;
  assert.equal(await allowed("intro-media", INTRO), true);
  assert.equal(await allowed("wall-video", WALL), true);
  assert.equal(await allowed("wall-video-derived", WALL), false, "bucket must match");
  assert.equal(await allowed("avatars", AVATAR), false, "Avatars are read directly, never leased");
  assert.equal(await allowed("intro-media", `${A}/../x`), false);
  await f.db.exec("delete from private.fixture_public");
  assert.equal(await allowed("intro-media", INTRO), false, "unpublished / PRIVATE: no lease");
  for (const role of ["anon", "authenticated"]) {
    await f.db.exec(`set role ${role};`);
    await assert.rejects(f.db.query("select public.public_media_lease_allowed('intro-media', $1)", [INTRO]), /permission denied/);
    await assert.rejects(f.db.query("select public.public_banner_object('alpha')"), /permission denied/);
    await assert.rejects(f.db.query("select public.public_media_hit('media:00000000000000000000000000000000', 5)"), /permission denied/);
    await f.db.exec("reset role;");
  }
});

test("public_banner_object: only the attached JPEG Banner of a PUBLIC GamID", async () => {
  const f = await fixture();
  const get = async h => (await f.service("select public.public_banner_object($1) p", [h]))[0].p;
  assert.equal(await get("alpha"), null, "nothing attached");
  await f.db.query(`update public.profiles set banner_media_reference = $1, banner_updated_at = now() where entity_id = '${EA}'`, [BANNER]);
  assert.equal(await get("alpha"), BANNER);
  assert.equal(await get(" ALPHA "), BANNER, "normalized handle");
  for (const visibility of ["PRIVATE", "DRAFT"]) { await f.db.exec(`update public.entities set visibility = '${visibility}' where entity_id = '${EA}'`); assert.equal(await get("alpha"), null, visibility); }
  await f.db.exec(`update public.entities set visibility = 'PUBLIC' where entity_id = '${EA}'`);
  await f.db.query(`update storage.objects set metadata = '{"mimetype":"text/html","size":10}' where name = $1`, [BANNER]);
  assert.equal(await get("alpha"), null, "not the gateway's JPEG");
  assert.equal(await get("bravo"), null);
  assert.equal(await get("nobody"), null);
});

test("public_media_hit: a fixed per-minute window per key; keys are hashes only", async () => {
  const f = await fixture();
  const hit = async k => (await f.service("select public.public_media_hit($1, 2) ok", [k]))[0].ok;
  const k = "media:0123456789abcdef0123456789abcdef";
  assert.deepEqual([await hit(k), await hit(k), await hit(k)], [true, true, false]);
  assert.equal(await hit("banner:0123456789abcdef0123456789abcdef"), true, "independent keys");
  await assert.rejects(f.service("select public.public_media_hit($1, 2)", ["203.0.113.7"]), /public_media_rate_rate_key_check/, "never a raw address");
});

test("Banner compare-and-set conflicts now raise SQLSTATE PT409 (HTTP 409), not 40001 (HTTP 504)", async () => {
  const f = await fixture();
  await f.db.exec(`set role authenticated; set request.jwt.claim.sub = '${A}';`);
  await f.db.query("select * from public.attach_my_banner($1, null)", [BANNER]);
  await assert.rejects(f.db.query("select * from public.attach_my_banner($1, null)", [BANNER]), e => e.code === "PT409" && e.message === "BANNER_CHANGED");
  await assert.rejects(f.db.query("select * from public.remove_my_banner(null)"), e => e.code === "PT409" && e.message === "BANNER_CHANGED");
  assert.equal((await f.db.query("select previous_path from public.remove_my_banner($1)", [BANNER])).rows[0].previous_path, BANNER);
  await f.db.exec("reset role;");
  assert.doesNotMatch(migration, /errcode = '40001'/);
});
