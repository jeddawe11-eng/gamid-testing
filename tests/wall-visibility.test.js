// Enable / Disable My Wall: the real publishing migration + the toggle migration in an isolated PGlite Postgres (only pre-existing Wall helpers are stubbed).
// The public result follows the persisted owner choice (server-side), the published snapshot is never changed, the GamID's own visibility is independent,
// existing published Walls stay enabled, and nobody can toggle another GamID's Wall. Nothing touches TESTING.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const publishing = read("supabase/migrations/20261002120000_wall_public_publishing.sql");
const toggle = read("supabase/migrations/20261009170000_wall_public_publishing_toggle.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const DOC = { schemaVersion: 1, stages: [{ id: "s1", elements: [{ id: "e1", type: "text", payload: { text: "My Wall" } }] }] };

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema private; create schema auth; create schema storage;
    grant usage on schema public, private, auth, storage to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.wall_drafts (entity_id uuid primary key, document jsonb, revision bigint);
    create table public.wall_assets (asset_id uuid primary key, entity_id uuid, storage_path text, mime_type text, width int, height int);
    create table storage.objects (bucket_id text, name text);
    alter table storage.objects enable row level security;
    create function private.wall_document_errors(jsonb) returns text[] language sql immutable as $$ select array[]::text[] $$;
    create function private.wall_document_asset_ids(jsonb) returns text[] language sql immutable as $$ select coalesce(array(select jsonb_array_elements_text($1 -> 'assetIds')), array[]::text[]) $$;
    create function private.wall_owned_entity_id() returns uuid language plpgsql stable security definer set search_path = '' as $$
      declare owned uuid; begin
        if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
        select e.entity_id into owned from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id where m.user_id = (select auth.uid()) and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1;
        if owned is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if; return owned; end $$;
    grant execute on function auth.uid(), private.normalize_handle(text), private.wall_document_errors(jsonb), private.wall_document_asset_ids(jsonb), private.wall_owned_entity_id() to anon, authenticated;
    create function private.delete_my_wall_asset_impl(uuid) returns table (storage_path text) language sql as $$ select null::text $$;
    insert into public.entities values ('${EA}', 'SOLO', 'espada', 'PUBLIC'), ('${EB}', 'SOLO', 'other', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    insert into public.wall_drafts values ('${EA}', '${JSON.stringify({ ...DOC, assetIds: ["cccccccc-cccc-4ccc-8ccc-cccccccccccc"] })}', 3), ('${EB}', '${JSON.stringify(DOC)}', 1);
    insert into public.wall_assets values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc', '${EA}', '${A}/pic.png', 'image/png', 10, 10);`);
  await db.exec(publishing);
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const publicWall = async handle => { await as(null); const rows = (await db.query("select * from public.get_public_wall($1)", [handle])).rows; await admin(); return rows; };
  const mediaReadable = async () => { await as(null); const r = (await db.query("select private.wall_object_is_published('wall-media', $1) ok", [`${A}/pic.png`])).rows[0].ok; await admin(); return r; };
  return { db, as, admin, publicWall, mediaReadable };
}
const code = error => error?.message ?? String(error);

test("migration: additive and backward compatible - an existing published Wall stays enabled, its snapshot unchanged", async () => {
  const f = await fixture();
  await f.as(A); await f.db.query("select * from public.publish_my_wall(3)"); await f.admin();
  const before = (await f.db.query("select document, draft_revision, published_at from public.wall_publications")).rows;
  await f.db.exec(toggle);
  const after = (await f.db.query("select document, draft_revision, published_at, is_enabled from public.wall_publications")).rows;
  assert.deepEqual(after.map(({ is_enabled, ...rest }) => rest), before);
  assert.deepEqual(after.map(r => r.is_enabled), [true]);
  assert.equal((await f.publicWall("espada")).length, 1, "still the Wall for visitors");
  assert.match(toggle, /alter table public\.wall_publications add column is_enabled boolean not null default true;/);
  assert.doesNotMatch(toggle.replace(/--.*$/gm, ""), /\bdrop\b|\bdelete\b|\btruncate\b|publish_my_wall_impl|unpublish_my_wall_impl|(update|alter table)\s+public\.entities/i, "no data removed; Publish / Unpublish and GamID visibility untouched");
});

test("the public result follows the owner's persisted choice; the snapshot, media and GamID visibility are kept; Enable restores the same Wall", async () => {
  const f = await fixture();
  await f.db.exec(toggle);
  await f.as(A);
  assert.deepEqual((await f.db.query("select * from public.get_my_wall_visibility()")).rows.map(r => [r.published, r.is_enabled]), [[false, false]], "not published yet");
  await assert.rejects(f.db.query("select * from public.set_my_wall_enabled(true)"), e => code(e) === "WALL_NOT_PUBLISHED", "an unpublished draft is never exposed");
  await f.db.query("select * from public.publish_my_wall(3)");
  await f.admin();
  const published = await f.publicWall("espada");
  assert.equal(published.length, 1, "PUBLIC + published + enabled -> Wall");
  assert.equal(await f.mediaReadable(), true);
  // Disable
  await f.as(A);
  assert.deepEqual((await f.db.query("select * from public.set_my_wall_enabled(false)")).rows.map(r => [r.published, r.is_enabled, Number(r.draft_revision)]), [[true, false, 3]]);
  await f.admin();
  assert.deepEqual(await f.publicWall("espada"), [], "PUBLIC + published + disabled -> Classic Profile");
  assert.equal(await f.mediaReadable(), false, "a disabled Wall's media is not publicly readable");
  assert.equal((await f.db.query(`select visibility from public.entities where entity_id = '${EA}'`)).rows[0].visibility, "PUBLIC", "the GamID stays PUBLIC");
  assert.equal((await f.db.query("select count(*)::int n from public.wall_publications")).rows[0].n, 1, "the snapshot is kept");
  // still editable: the draft can change and even be published again - it stays hidden until Enable
  await f.db.exec(`update public.wall_drafts set document = '${JSON.stringify({ ...DOC, stages: [{ id: "s1", elements: [] }] })}', revision = 4 where entity_id = '${EA}'`);
  await f.as(A); await f.db.query("select * from public.publish_my_wall(4)"); await f.db.query("select * from public.publish_my_wall(4)"); await f.admin();
  assert.deepEqual(await f.publicWall("espada"), [], "republishing keeps the owner's Disabled choice");
  // Enable: the published Wall returns (the same snapshot that is stored)
  const stored = (await f.db.query("select document from public.wall_publications")).rows[0].document;
  await f.as(A); await f.db.query("select * from public.set_my_wall_enabled(true)"); await f.admin();
  const back = await f.publicWall("espada");
  assert.deepEqual(back.map(r => r.document), [stored]);
  assert.deepEqual((await f.db.query("select is_enabled from public.wall_publications")).rows, [{ is_enabled: true }], "persisted");
  // PRIVATE GamID: nothing, whatever the Wall setting
  await f.db.exec(`update public.entities set visibility = 'DRAFT' where entity_id = '${EA}'`);
  assert.deepEqual(await f.publicWall("espada"), []);
  await f.as(A); await f.db.query("select * from public.set_my_wall_enabled(false)"); await f.db.query("select * from public.set_my_wall_enabled(true)"); await f.admin();
  assert.deepEqual(await f.publicWall("espada"), [], "PRIVATE stays private regardless of Wall setting");
  assert.equal(await f.mediaReadable(), false);
});

test("nobody can toggle another GamID's Wall; anonymous callers cannot toggle or read owner state; the table stays closed", async () => {
  const f = await fixture();
  await f.db.exec(toggle);
  await f.as(A); await f.db.query("select * from public.publish_my_wall(3)");
  await f.as(B);
  await assert.rejects(f.db.query("select * from public.set_my_wall_enabled(false)"), e => code(e) === "WALL_NOT_PUBLISHED", "B acts only on B's own (unpublished) Wall");
  assert.deepEqual((await f.db.query("select * from public.get_my_wall_visibility()")).rows.map(r => r.published), [false], "B never sees A's state");
  await assert.rejects(f.db.query("update public.wall_publications set is_enabled = false"), /permission denied/);
  await assert.rejects(f.db.query("select * from public.wall_publications"), /permission denied/);
  assert.match(toggle, /create function public\.set_my_wall_enabled\(candidate_enabled boolean\)/, "the only argument is the choice - never an owner or GamID id");
  await f.admin();
  assert.equal((await f.publicWall("espada")).length, 1, "A's Wall is untouched by B");
  await f.as(null);
  await assert.rejects(f.db.query("select * from public.set_my_wall_enabled(false)"), /permission denied/);
  await assert.rejects(f.db.query("select * from public.get_my_wall_visibility()"), /permission denied/);
});

test("Profile Editor: My Wall shows the saved state with Edit and the toggle, confirms first, and never shows a success the server did not confirm", () => {
  const html = read("dist/account/index.html"), js = read("dist/account/account.js");
  assert.match(html, /<div class="wall-entry-actions"><a class="primary play-together-link" href="\.\.\/wall-editor\/">EDIT WALL<\/a><button id="wallToggleButton" class="secondary" type="button" hidden>Disable My Wall<\/button><\/div>/);
  assert.match(html, /<dialog id="wallToggleDialog"[^>]*aria-labelledby="wallToggleTitle"/);
  for (const text of ["Disable My Wall?", "Your Classic Profile will appear instead. Your Wall content will be saved.", "Enable My Wall?", "Your saved Wall will appear on your public profile again."]) assert.ok(js.includes(text) || html.includes(text), text);
  assert.match(js, /if \(!v \|\| v\.is_enabled !== enable\) throw/, "the new state comes from the server's answer");
  assert.match(js, /if \(wallBusy \|\| !wallDialog\.open\) return;/, "one change at a time");
  assert.match(js, /\/\/ the previous state stays: nothing on screen claims a change the server did not make/);
  assert.doesNotMatch(read("dist/public/public.js"), /is_enabled|wallEnabled/, "the visitor page needs no client-side switch: the server decides");
});
