// About Me + the desktop profile extras (DEC-0005 Phase 2): the real Banner / visitor-media migrations and the new About Me migration in an isolated PGlite
// Postgres. Proves: private by default (existing profiles too), owner-only writes, every server rule (Location text, max 5 languages / genres, catalog values,
// no duplicates), a switch cannot stay ON without a value, and the anonymous reader returns ONLY the public values of a PUBLIC GamID plus its Member Since
// year and whether a Banner can be delivered - never a Storage path.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const about = read("supabase/migrations/20261010160000_profile_about_me.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const BANNER = `${A}/banner/0000000a-0000-4000-8000-000000000001.jpg`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function storage.operation() returns text language plpgsql stable as $$ begin return current_setting('storage.operation', true); end; $$;
    grant execute on function auth.uid(), storage.operation() to anon, authenticated, service_role;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    grant execute on function private.normalize_handle(text) to anon, authenticated, service_role;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text, avatar_media_reference text, created_at timestamptz not null default now());
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.profiles (profile_id uuid primary key default gen_random_uuid(), entity_id uuid unique, updated_at timestamptz);
    insert into public.entities values ('${EA}', 'SOLO', 'alpha', 'PUBLIC', null, '2024-03-05T10:00:00Z'), ('${EB}', 'SOLO', 'bravo', 'PUBLIC', null, '2026-01-01T00:30:00Z');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.profiles (entity_id) values ('${EA}'), ('${EB}');
    create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, owner_id text, metadata jsonb, created_at timestamptz not null default now());
    alter table storage.objects enable row level security; grant select on storage.objects to anon, authenticated;
    create table private.usage_uploads (bucket text, path text, owner_id uuid, state text);
    create function private.usage_object_owned(b text, p text, u uuid) returns boolean language sql stable security definer set search_path = '' as $$ select exists (select 1 from private.usage_uploads x where x.bucket = b and x.path = p and x.owner_id = u and x.state = 'COMPLETE') $$;
    grant execute on function private.usage_object_owned(text, text, uuid) to authenticated;
    create function private.intro_media_is_public(p text) returns boolean language sql stable as $$ select false $$;
    create function private.wall_object_is_published(b text, p text) returns boolean language sql stable as $$ select false $$;`);
  for (const f of ["20261010120000_profile_banner.sql", "20261010130000_profile_banner_read_containment.sql", "20261010140000_visitor_storage_signing.sql"]) await db.exec(read(`supabase/migrations/${f}`));
  const before = (await db.query("select * from public.profiles order by entity_id")).rows;
  await db.exec(about);
  const call = async (uid, sql, params = []) => { await db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';"); try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role;"); } };
  const set = (uid, v) => call(uid, "select * from public.set_my_about($1, $2, $3, $4, $5, $6)", [v.location ?? null, v.languages ?? [], v.genres ?? [], v.showLocation ?? false, v.showLanguages ?? false, v.showGenres ?? false]);
  const extras = async handle => (await call(null, "select * from public.get_public_profile_extras($1)", [handle]))[0] ?? null;
  return { db, before, call, set, extras };
}
const code = e => e?.message ?? String(e);

test("migration: additive - existing profiles keep every value and start with nothing public", async () => {
  const f = await fixture();
  const after = (await f.db.query("select * from public.profiles order by entity_id")).rows;
  const added = ["about_location", "about_languages", "about_genres", "show_about_location", "show_about_languages", "show_about_genres"];
  assert.deepEqual(after.map(r => Object.fromEntries(Object.entries(r).filter(([k]) => !added.includes(k)))), f.before);
  for (const r of after) assert.deepEqual([r.about_location, r.about_languages, r.about_genres, r.show_about_location, r.show_about_languages, r.show_about_genres], [null, [], [], false, false, false]);
  assert.doesNotMatch(about.replace(/--.*$/gm, ""), /\bdrop\b|\bdelete\s+from\b|\btruncate\b|get_public_identity|storage\.objects|create policy/i, "nothing removed; the identity reader and Storage are not touched");
});

test("owner read / write: catalogs, Member Since from entities.created_at, and the validated values", async () => {
  const f = await fixture();
  const mine = (await f.call(A, "select * from public.get_my_about()"))[0];
  assert.equal(mine.member_since_year, 2024);
  assert.equal(mine.catalogs.languages.length, 34); assert.equal(mine.catalogs.genres.length, 20);
  assert.deepEqual(mine.catalogs.languages.slice(0, 2), [{ code: "ar", label: "Arabic" }, { code: "en", label: "English" }]);
  const row = (await f.set(A, { location: "  Riyadh,   Saudi Arabia ", languages: ["ar", "en"], genres: ["action", "rpg", "fps"], showLocation: true, showLanguages: true, showGenres: false }))[0];
  assert.deepEqual([row.about_location, row.about_languages, row.about_genres, row.show_location, row.show_languages, row.show_genres], ["Riyadh, Saudi Arabia", ["ar", "en"], ["action", "rpg", "fps"], true, true, false]);
  assert.equal((await f.call(B, "select * from public.get_my_about()"))[0].about_location, null, "B never sees A's About Me");
});

test("server rules: Location text only (60 max, no links / markup / line breaks), at most 5 catalog values each, no duplicates", async () => {
  const f = await fixture();
  for (const [v, err] of [
    [{ location: "x".repeat(61) }, "INVALID_ABOUT_LOCATION"], [{ location: "https://evil.example" }, "INVALID_ABOUT_LOCATION"], [{ location: "www.example.com" }, "INVALID_ABOUT_LOCATION"],
    [{ location: "<b>Riyadh</b>" }, "INVALID_ABOUT_LOCATION"], [{ location: "Riyadh\nJeddah" }, "INVALID_ABOUT_LOCATION"],
    [{ languages: ["ar", "en", "fr", "es", "de", "it"] }, "TOO_MANY_LANGUAGES"], [{ genres: ["action", "rpg", "fps", "moba", "mmo", "sports"] }, "TOO_MANY_GENRES"],
    [{ languages: ["ar", "ar"] }, "DUPLICATE_LANGUAGE"], [{ genres: ["rpg", "rpg"] }, "DUPLICATE_GENRE"], [{ languages: ["xx"] }, "INVALID_LANGUAGE"], [{ genres: ["dating"] }, "INVALID_GENRE"],
  ]) await assert.rejects(f.set(A, v), e => code(e) === err, JSON.stringify(v));
  assert.equal((await f.set(A, { location: "x".repeat(60) }))[0].about_location.length, 60, "exactly 60 is allowed");
  assert.equal((await f.set(A, { location: "Kuala Lumpur, Malaysia" }))[0].about_location, "Kuala Lumpur, Malaysia");
  await assert.rejects(f.call(null, "select * from public.set_my_about(null, '{}', '{}', false, false, false)"), /permission denied/);
  await assert.rejects(f.call(null, "select * from public.get_my_about()"), /permission denied/);
});

test("a switch cannot be ON without its value; clearing a value turns its switch OFF", async () => {
  const f = await fixture();
  let r = (await f.set(A, { showLocation: true, showLanguages: true, showGenres: true }))[0];
  assert.deepEqual([r.show_location, r.show_languages, r.show_genres], [false, false, false]);
  r = (await f.set(A, { location: "Riyadh", languages: ["ar"], genres: ["rpg"], showLocation: true, showLanguages: true, showGenres: true }))[0];
  assert.deepEqual([r.show_location, r.show_languages, r.show_genres], [true, true, true]);
  r = (await f.set(A, { location: "  ", languages: [], genres: ["rpg"], showLocation: true, showLanguages: true, showGenres: true }))[0];
  assert.deepEqual([r.about_location, r.show_location, r.show_languages, r.show_genres], [null, false, false, true]);
  await assert.rejects(f.db.query(`update public.profiles set show_about_languages = true, about_languages = '{}' where entity_id = '${EA}'`), /profiles_about_switches_check/);
});

test("public extras: only the PUBLIC values of a PUBLIC GamID, Member Since, and Banner availability - never a path", async () => {
  const f = await fixture();
  assert.deepEqual(await f.extras("alpha"), { member_since_year: 2024, has_banner: false, about_location: null, about_languages: [], about_genres: [] }, "private by default");
  await f.set(A, { location: "Riyadh", languages: ["en", "ar"], genres: ["rpg", "action"], showLocation: false, showLanguages: true, showGenres: true });
  assert.deepEqual(await f.extras("alpha"), { member_since_year: 2024, has_banner: false, about_location: null, about_languages: [{ code: "en", label: "English" }, { code: "ar", label: "Arabic" }], about_genres: [{ key: "rpg", label: "RPG" }, { key: "action", label: "Action" }] }, "owner order kept; the private Location is not sent");
  await f.db.query(`insert into storage.objects (bucket_id, name, metadata) values ('avatars', $1, '{"mimetype":"image/jpeg","size":30000}')`, [BANNER]);
  await f.db.query(`update public.profiles set banner_media_reference = $1, banner_updated_at = now() where entity_id = '${EA}'`, [BANNER]);
  const withBanner = await f.extras("alpha");
  assert.equal(withBanner.has_banner, true);
  assert.doesNotMatch(JSON.stringify(withBanner), /banner\/|avatars|\.jpg/, "no Storage path ever leaves the server");
  for (const visibility of ["PRIVATE", "DRAFT"]) { await f.db.exec(`update public.entities set visibility = '${visibility}' where entity_id = '${EA}'`); assert.equal(await f.extras("alpha"), null, visibility); }
  assert.equal((await f.extras("BRAVO")).member_since_year, 2026, "UTC year, normalized handle");
  assert.equal(await f.extras("nobody"), null);
});
