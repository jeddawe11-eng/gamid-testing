// ISS-0007: an Avatar can only become a GamID's Avatar when it is the upload gateway's own validated JPEG (stored since the validating gateway went live), and the
// browser only ever sends the cropper's square JPEG. The migration runs in an isolated PGlite Postgres with minimal stand-ins for the accepted tables it uses.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { createNormalizedAvatar, normalizeAvatarFile, AvatarCropState, AVATAR_MIN_OUTPUT } from "../dist/account/avatar-cropper.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261011220000_avatar_validated_attach.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222";
const EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const F1 = "44444444-4444-4444-8444-444444444441", F2 = "44444444-4444-4444-8444-444444444442", F3 = "44444444-4444-4444-8444-444444444443";
const PROFILE_ROW = "entity_id uuid, gamid_handle text, display_name text, avatar_media_reference text, visibility public.entity_visibility, profile_id uuid, profile_status public.profile_status, bio text, role_keys text[], primary_role_key text, education_work_status text, institution text, field_of_study text, role_catalog jsonb, education_work_catalog jsonb";

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
    create type public.entity_visibility as enum ('DRAFT', 'PRIVATE', 'PUBLIC'); create type public.profile_status as enum ('ACTIVE');
    create table storage.objects (bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable as $$ select exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and x.owner_id = u and x.state = 'COMPLETE') $$;
    create table public.entities (entity_id uuid primary key, created_by_user_id uuid, entity_type text, avatar_media_reference text, display_name text, updated_at timestamptz);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid, bio text, education_work_status text, institution text, field_of_study text, updated_at timestamptz);
    create table public.gaming_role_catalog (role_key text primary key, active boolean default true);
    create table public.education_work_status_catalog (status_key text primary key, active boolean default true);
    create table public.profile_gaming_roles (profile_id uuid, role_key text, is_primary boolean, sort_order smallint);
    create function private.get_my_identity_profile_impl() returns table (${PROFILE_ROW}) language sql stable security definer set search_path = '' as $$
      select e.entity_id, null::text, e.display_name, e.avatar_media_reference, 'PUBLIC'::public.entity_visibility, p.profile_id, 'ACTIVE'::public.profile_status, p.bio,
        array[]::text[], null::text, null::text, null::text, null::text, '[]'::jsonb, '[]'::jsonb
      from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id join public.profiles p on p.entity_id = e.entity_id where m.user_id = auth.uid() $$;
    insert into public.entities values ('${EA}', '${A}', 'SOLO', '${A}/avatar-old.webp', 'Alpha', now()), ('${EB}', '${B}', 'SOLO', null, 'Bravo', now());
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id, bio) values ('${EA}', ''), ('${EB}', '');`);
  await db.exec(migration);
  await db.exec(`grant execute on function private.attach_avatar_impl(text), private.update_my_identity_profile_impl(text,text,text,text[],text,text,text,text) to authenticated;`);
  const since = (await db.query("select validated_since from private.avatar_validation")).rows[0].validated_since;
  // an object the gateway stored (receipt COMPLETE, service-owned) - `offset` seconds after (or, negative, before) the validating gateway went live
  const object = async (owner, name, { mime = "image/jpeg", offset = 1 } = {}) => {
    await db.query("insert into storage.objects (bucket_id, name, owner_id, metadata, created_at) values ('avatars', $1, null, jsonb_build_object('mimetype', $2::text, 'size', 1000), $3::timestamptz + make_interval(secs => $4))", [name, mime, since, offset]);
    await db.query("insert into private.usage_uploads values ('avatars', $1, $2, 'COMPLETE')", [name, owner]);
  };
  const as = async (uid, sql, params = []) => { await db.exec(`set role authenticated; set request.jwt.claim.sub = '${uid}';`); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  const avatarOf = async entity => (await db.query("select avatar_media_reference a from public.entities where entity_id = $1", [entity])).rows[0].a;
  return { db, object, as, avatarOf };
}
const refused = code => error => error?.message === code;
const updateProfile = path => `select avatar_media_reference from private.update_my_identity_profile_impl('Alpha', '', ${path === null ? "null" : `'${path}'`})`;

test("ISS-0007 attach: a gateway-validated JPEG stored since the fix is attached; earlier, mislabelled, foreign, missing or oddly named objects never are", async () => {
  const f = await fixture();
  const good = `${A}/avatar-${F1}.jpg`;
  await f.object(A, good);
  assert.deepEqual(await f.as(A, "select private.attach_avatar_impl($1) p", [good]), [{ p: good }]);
  assert.equal(await f.avatarOf(EA), good);

  const before = `${A}/avatar-${F2}.jpg`, webp = `${A}/avatar-${F3}.jpg`, foreign = `${B}/avatar-${F1}.jpg`;
  await f.object(A, before, { offset: -60 });                    // stored byte-for-byte before the validating gateway
  await f.object(A, webp, { mime: "image/webp" });
  await f.object(B, foreign);
  for (const [label, path] of [["stored before the fix", before], ["not image/jpeg", webp], ["another owner's", foreign], ["missing", `${A}/avatar-${F2.replace("2", "9")}.jpg`],
    ["old naming", `${A}/avatar-old.webp`.replace("old", "new")], ["not an avatar name", `${A}/${F1}.jpg`]]) {
    await assert.rejects(f.as(A, "select private.attach_avatar_impl($1)", [path]), refused("INVALID_AVATAR_PATH"), label);
  }
  await assert.rejects(f.as(B, "select private.attach_avatar_impl($1)", [good]), refused("INVALID_AVATAR_PATH"), "someone else's validated Avatar");
  assert.equal(await f.avatarOf(EA), good, "nothing changed by a refusal");
  assert.equal(await f.avatarOf(EB), null);
});

test("ISS-0007 profile save: a new Avatar must be validated; the Avatar a GamID already shows (even an older WebP) is kept; no Avatar change is unaffected", async () => {
  const f = await fixture();
  assert.deepEqual(await f.as(A, updateProfile(`${A}/avatar-old.webp`)), [{ avatar_media_reference: `${A}/avatar-old.webp` }], "the current (pre-fix) Avatar stays");
  assert.deepEqual(await f.as(A, updateProfile(null)), [{ avatar_media_reference: `${A}/avatar-old.webp` }]);
  const before = `${A}/avatar-${F2}.jpg`;
  await f.object(A, before, { offset: -60 });
  await assert.rejects(f.as(A, updateProfile(before)), refused("INVALID_AVATAR_PATH"));
  const good = `${A}/avatar-${F1}.jpg`;
  await f.object(A, good);
  assert.deepEqual(await f.as(A, updateProfile(good)), [{ avatar_media_reference: good }]);
  assert.equal(await f.avatarOf(EA), good);
});

test("ISS-0007 migration: additive and owner-only; no Storage object, policy or quota is touched", () => {
  const sql = migration.replace(/--[^\n]*/g, "");
  assert.doesNotMatch(sql, /\b(delete\s+from\s+storage|update\s+storage|insert\s+into\s+storage|drop\s+policy|create\s+policy|alter\s+policy|usage_policy|quota)\b/i);
  assert.match(sql, /revoke all on function private\.avatar_attachable\(uuid, text\) from public, anon, authenticated;/);
  assert.match(sql, /revoke all on table private\.avatar_validation from public, anon, authenticated, service_role;/);
});

test("ISS-0007 browser: the cropper and onboarding export a square JPEG at least 16 px; uploadAvatar sends only JPEG to <uid>/avatar-<uuid>.jpg", async () => {
  const drawn = [];
  globalThis.document = { createElement: () => ({ width: 0, height: 0, getContext: () => ({ drawImage: (...a) => drawn.push(a) }), toBlob(done, type) { done(new Blob([new Uint8Array(4)], { type })); } }) };
  try {
    const out = await createNormalizedAvatar({}, new AvatarCropState(1200, 800));
    assert.equal(out.blob.type, "image/jpeg"); assert.equal(out.width, out.height);
    assert.equal(new AvatarCropState(10, 10).outputSize(), AVATAR_MIN_OUTPUT, "a tiny source is scaled up to the gateway's minimum");
    let released = 0;
    const blob = await normalizeAvatarFile(new Blob([]), { loader: async () => ({ width: 900, height: 1600 }), releaser: () => released++ });
    assert.equal(blob.type, "image/jpeg"); assert.equal(released, 1, "the decoded image is released");
  } finally { delete globalThis.document; }
  const client = read("dist/account/supabase-client.js"), account = read("dist/account/account.js");
  assert.match(client, /if \(file\.type !== "image\/jpeg"\) throw new ApiError\(/);
  assert.match(client, /const path = `\$\{userId\}\/avatar-\$\{crypto\.randomUUID\(\)\}\.jpg`;/);
  assert.match(account, /await api\.uploadAvatar\(await normalizeAvatarFile\(avatar\), api\.userIdFromToken\(\)\)/, "onboarding no longer uploads the raw file");
  assert.match(read("dist/account/domain.js"), /INVALID_AVATAR_TYPE: "That file is not a supported image\./);
});
