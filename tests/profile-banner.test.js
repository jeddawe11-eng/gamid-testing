// Classic Profile Banner storage foundation (Phase 1B) and its Phase 1C containment: the real Banner migrations + the real accepted Avatar read-policy
// migrations in an isolated PGlite Postgres with a stubbed `storage.objects` (RLS on, Supabase-style grants) and a stubbed usage receipt check. Proves owner-only,
// compare-and-set attach / remove, delete protection and orphan listing; that after containment NO visitor (anonymous or another signed-in user) can SELECT -
// and so sign - any Banner object, whatever the GamID visibility; that the owner still can; and that the Avatar rules are unchanged.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const banner = read("supabase/migrations/20261010120000_profile_banner.sql");
const containment = read("supabase/migrations/20261010130000_profile_banner_read_containment.sql");
const avatarRead = read("supabase/migrations/20260918121000_public_profile_avatar_read.sql");
const avatarFix = read("supabase/migrations/20260918122000_public_profile_avatar_policy_fix.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const P1 = `${A}/banner/0000000a-0000-4000-8000-000000000001.jpg`, P2 = `${A}/banner/0000000a-0000-4000-8000-000000000002.jpg`;
const PB = `${B}/banner/0000000b-0000-4000-8000-000000000001.jpg`, AVATAR = `${A}/avatar-0000000a-0000-4000-8000-00000000000f.webp`;

async function fixture({ contain = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated, service_role;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text, avatar_media_reference text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC', '${AVATAR}'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC', null);
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    alter table storage.objects enable row level security;
    grant select, delete on storage.objects to anon, authenticated;
    -- the accepted gateway receipt check (stub with the same signature): a COMPLETE receipt of that owner
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable security definer set search_path = '' as $$
      select exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and x.owner_id = u and x.state = 'COMPLETE') $$;
    grant execute on function private.usage_object_owned(text, text, uuid) to authenticated;
    -- the accepted permissive owner delete (gamid_usage_gateway_delete, without the Intro clause) so the restrictive Banner rule can be shown narrowing it
    create policy owner_receipt_delete on storage.objects for delete to authenticated using (private.usage_object_owned(bucket_id, name, (select auth.uid())));
    -- the accepted owner read (gamid_usage_gateway_read)
    create policy owner_receipt_read on storage.objects for select to authenticated using (private.usage_object_owned(bucket_id, name, (select auth.uid())));`);
  await db.exec(avatarRead);
  await db.exec(avatarFix);
  await db.exec(banner);
  if (contain) await db.exec(containment);
  await db.query(`insert into storage.objects (bucket_id, name, metadata) values ('avatars', $1, '{"mimetype":"image/webp","size":1000}')`, [AVATAR]);
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const put = async (path, owner, { mime = "image/jpeg", size = 245619, receipt = true, age = "2 hours" } = {}) => {
    await db.query(`insert into storage.objects (bucket_id, name, metadata, created_at) values ('avatars', $1, $2, now() - $3::interval)`, [path, { mimetype: mime, size }, age]);
    if (receipt) await db.query(`insert into private.usage_uploads values ('avatars', $1, $2, 'COMPLETE')`, [path, owner]);
  };
  const call = async (uid, sql, params = []) => { await as(uid); try { return (await db.query(sql, params)).rows; } finally { await admin(); } };
  const anonSees = async path => (await call(null, "select name from storage.objects where bucket_id = 'avatars' and name = $1", [path])).length === 1;
  return { db, as, admin, put, call, anonSees };
}
const code = error => error?.message ?? String(error);

test("migration: additive - two nullable columns, a strict path shape, and the Avatar policies untouched", async () => {
  const f = await fixture();
  assert.deepEqual((await f.db.query("select banner_media_reference, banner_updated_at from public.profiles")).rows, [{ banner_media_reference: null, banner_updated_at: null }, { banner_media_reference: null, banner_updated_at: null }]);
  await assert.rejects(f.db.query(`update public.profiles set banner_media_reference = '${AVATAR}', banner_updated_at = now() where entity_id = '${EA}'`), /profiles_banner_path_check/, "an Avatar path can never be a Banner");
  await assert.rejects(f.db.query(`update public.profiles set banner_media_reference = '${P1}' where entity_id = '${EA}'`), /profiles_banner_updated_check/);
  const stripped = banner.replace(/--.*$/gm, "");
  assert.doesNotMatch(stripped, /\bdrop\b|\btruncate\b|\bdelete\s+from\b|avatar_is_public|attach_avatar|update_my_identity_profile|reserve_usage_upload|authorize_usage_delete\s*\(|usage_policy|quota/i, "nothing removed; Avatar, usage and quota functions untouched");
  assert.ok(await f.anonSees(AVATAR), "the accepted public Avatar read still works");
});

test("attach: only the caller's own uploaded JPEG (receipt, type, size) under <uid>/banner/; compare-and-set; idempotent", async () => {
  const f = await fixture();
  await f.put(P1, A); await f.put(P2, A); await f.put(PB, B);
  await f.put(`${A}/banner/0000000a-0000-4000-8000-000000000003.jpg`, A, { mime: "image/png" });
  await f.put(`${A}/banner/0000000a-0000-4000-8000-000000000004.jpg`, A, { size: 5242881 });
  await f.put(`${A}/banner/0000000a-0000-4000-8000-000000000005.jpg`, A, { receipt: false });
  const attach = (uid, path, expected) => f.call(uid, "select * from public.attach_my_banner($1, $2)", [path, expected]);
  for (const [path, why] of [[PB, "another owner's folder"], [AVATAR, "an Avatar path"], [`${A}/banner/x.jpg`, "bad name"], [`${A}/banner/0000000a-0000-4000-8000-000000000009.jpg`, "missing object"],
    [`${A}/banner/0000000a-0000-4000-8000-000000000003.jpg`, "not a JPEG"], [`${A}/banner/0000000a-0000-4000-8000-000000000004.jpg`, "over 5 MiB"], [`${A}/banner/0000000a-0000-4000-8000-000000000005.jpg`, "no gateway receipt"]]) {
    await assert.rejects(attach(A, path, null), e => ["INVALID_BANNER_PATH", "BANNER_NOT_UPLOADED"].includes(code(e)), why);
  }
  assert.deepEqual((await attach(A, P1, null)).map(r => [r.banner_path, r.previous_path]), [[P1, null]]);
  assert.deepEqual((await attach(A, P1, P1)).map(r => [r.banner_path, r.previous_path]), [[P1, null]], "same Banner again: no change");
  await assert.rejects(attach(A, P2, null), e => code(e) === "BANNER_CHANGED", "a stale belief never overwrites the current Banner");
  assert.deepEqual((await attach(A, P2, P1)).map(r => [r.banner_path, r.previous_path]), [[P2, P1]], "replacement returns the old one to delete");
  await assert.rejects(f.call(A, "select * from public.remove_my_banner($1)", [P1]), e => code(e) === "BANNER_CHANGED");
  assert.deepEqual((await f.call(A, "select * from public.remove_my_banner($1)", [P2])).map(r => [r.banner_path, r.previous_path]), [[null, P2]]);
  assert.deepEqual((await f.call(A, "select * from public.remove_my_banner($1)", [null])).map(r => r.previous_path), [null], "nothing to remove: no-op");
  assert.deepEqual(await f.call(A, "select * from public.get_my_banner()"), [{ banner_path: null, banner_updated_at: null }]);
  assert.deepEqual((await f.call(B, "select * from public.get_my_banner()")).map(r => r.banner_path), [null], "B never sees A's Banner");
});

test("Phase 1B policy (before containment): anonymous SELECT of an attached PUBLIC Banner - the grant that made anonymous signing possible", async () => {
  const f = await fixture({ contain: false });
  await f.put(P1, A);
  await f.call(A, "select * from public.attach_my_banner($1, null)", [P1]);
  assert.equal(await f.anonSees(P1), true, "this SELECT is what POST /object/sign checks: after containment it must not exist");
});

test("containment removes exactly the Banner read policy - every other storage policy is identical", async () => {
  assert.equal(containment.replace(/--.*$/gm, "").trim(), 'drop policy "public profile banners are readable" on storage.objects;');
  const policies = async f => (await f.db.query("select policyname, cmd, permissive, roles::text r, coalesce(qual, '') q, coalesce(with_check, '') c from pg_policies where schemaname = 'storage' and tablename = 'objects' order by 1")).rows;
  const before = await policies(await fixture({ contain: false })), after = await policies(await fixture());
  assert.deepEqual(before.filter(x => x.policyname !== "public profile banners are readable"), after);
  assert.equal(before.length - after.length, 1);
  assert.equal(after.some(x => /banner_is_public/.test(x.q)), false, "no remaining policy hands a visitor a Banner");
});

test("after containment no visitor can SELECT (and so cannot sign) any Banner - PUBLIC, PRIVATE, DRAFT, attached, unattached or replaced; the owner still can", async () => {
  const f = await fixture();
  await f.put(P1, A); await f.put(P2, A); await f.put(PB, B);
  const visitorSees = async path => (await f.anonSees(path)) || (await f.call(B, "select name from storage.objects where name = $1", [path])).length === 1;
  assert.equal(await visitorSees(P1), false, "uploaded, not attached");
  await f.call(A, "select * from public.attach_my_banner($1, null)", [P1]);
  assert.equal(await visitorSees(P1), false, "PUBLIC + attached: still no visitor SELECT");
  assert.equal((await f.call(A, "select name from storage.objects where name = $1", [P1])).length, 1, "the owner reads their own Banner (gateway receipt)");
  for (const visibility of ["PRIVATE", "DRAFT", "PUBLIC"]) {
    await f.db.exec(`update public.entities set visibility = '${visibility}' where entity_id = '${EA}'`);
    assert.equal(await visitorSees(P1), false, visibility);
  }
  await f.call(A, "select * from public.attach_my_banner($1, $2)", [P2, P1]);
  assert.equal(await visitorSees(P1), false, "replaced"); assert.equal(await visitorSees(P2), false, "new one");
  assert.equal((await f.anonSees(PB)) || (await f.call(A, "select name from storage.objects where name = $1", [PB])).length === 1, false, "another owner's object");
  assert.equal(await f.anonSees(AVATAR), true, "the accepted public Avatar rule is unchanged");
});

test("an attached Banner cannot be deleted (Storage API or gateway); a detached one can; only the service role may ask the gateway question", async () => {
  const f = await fixture();
  await f.put(P1, A); await f.put(P2, A);
  await f.call(A, "select * from public.attach_my_banner($1, null)", [P1]);
  assert.equal((await f.call(A, "delete from storage.objects where name = $1 returning name", [P1])).length, 0, "the restrictive policy narrows the owner delete");
  assert.equal((await f.call(A, "delete from storage.objects where name = $1 returning name", [P2])).length, 1, "a detached Banner can be deleted by its owner");
  assert.equal((await f.call(B, "delete from storage.objects where name = $1 returning name", [P1])).length, 0);
  await f.db.exec("set role service_role;");
  await assert.rejects(f.db.query("select public.authorize_banner_delete($1, $2)", [A, P1]), /BANNER_IN_USE/);
  await assert.rejects(f.db.query("select public.authorize_banner_delete($1, $2)", [B, P1]), /UPLOAD_NOT_OWNED/);
  await f.admin();
  await assert.rejects(f.call(A, "select public.authorize_banner_delete($1, $2)", [A, P2]), /permission denied/);
  await assert.rejects(f.call(null, "select public.authorize_banner_delete($1, $2)", [A, P2]), /permission denied/);
});

test("orphans: the owner can list their own unattached Banner objects older than an hour (never the attached one, never another owner's, never in-flight)", async () => {
  const f = await fixture();
  await f.put(P1, A); await f.put(P2, A); await f.put(`${A}/banner/0000000a-0000-4000-8000-000000000006.jpg`, A, { age: "5 minutes" }); await f.put(PB, B);
  await f.call(A, "select * from public.attach_my_banner($1, null)", [P1]);
  assert.deepEqual((await f.call(A, "select path from public.list_my_unattached_banners()")).map(r => r.path), [P2]);
  assert.deepEqual((await f.call(B, "select path from public.list_my_unattached_banners()")).map(r => r.path), [PB]);
});

test("owner-only functions: anonymous callers cannot read, attach, remove or list; the only argument is the path / expected path", async () => {
  const f = await fixture();
  for (const sql of ["select * from public.get_my_banner()", "select * from public.attach_my_banner('x', null)", "select * from public.remove_my_banner(null)", "select * from public.list_my_unattached_banners()"]) {
    await assert.rejects(f.call(null, sql), /permission denied/, sql);
  }
  assert.match(banner, /create function public\.attach_my_banner\(candidate_path text, candidate_expected text\)/, "no owner or GamID id is ever accepted from the caller");
  await assert.rejects(f.call(null, "select * from public.profiles"), /permission denied/);
});
