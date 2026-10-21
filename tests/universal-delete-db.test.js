// Universal deletion (Mazen's contract 2026-10-21): the REAL migration (supabase/migrations/20261022100000_universal_delete_resolve.sql) on an isolated Postgres
// (PGlite), on top of the REAL Wall tables and helpers it relies on (drafts, publications, owner resolution, asset / font reference extraction, the fonts registry
// and its draft trigger). Only the W1 document validator is a stub (its full rules are tested elsewhere; here it lets one test force a validation failure).
// Covers: unused -> deleted at once; used -> nothing changes until resolve; resolve = draft + published Wall stripped and the row deleted in ONE transaction;
// revision conflicts, validation failures and unknown reference places roll back everything; ownership; renditions detach; and the database transforms
// match the editor's (wall-kit/ops.js) on the same documents.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const MIGRATION = read("supabase/migrations/20261022100000_universal_delete_resolve.sql");
const slice = (text, from, to) => { const at = text.indexOf(from); assert.ok(at >= 0, from); return text.slice(at, text.indexOf(to, at) + to.length); };
const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const ENTITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OTHER_ENTITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const IMG = "0000000a-0000-4000-8000-00000000000a", VID = "0000000b-0000-4000-8000-00000000000b", SPARE = "0000000c-0000-4000-8000-00000000000c", THEIRS = "0000000d-0000-4000-8000-00000000000d";
const FONT = "f0000000-0000-4000-8000-000000000001", FONT2 = "f0000000-0000-4000-8000-000000000002";

async function fixture() {
  const db = new PGlite();
  const persistence = read("supabase/migrations/20260925120000_wall_persistence_foundation.sql"), assetsSql = read("supabase/migrations/20260926110000_wall_assets.sql");
  const publishing = read("supabase/migrations/20261002120000_wall_public_publishing.sql"), fonts = read("supabase/migrations/20261018120000_wall_custom_fonts.sql");
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth;
    grant usage on schema public, private, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create table public.entities (entity_id uuid primary key, entity_type text, visibility text, gamid_handle text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    -- the W1 validator (stub): a document that sets "requireElements" must keep at least one element
    create function private.wall_document_errors(doc jsonb) returns text[] language sql immutable set search_path = '' as $$
      select case when coalesce((doc ->> 'requireElements')::boolean, false) and jsonb_path_query_first(doc, '$.stages[*].elements[*]') is null then array['NO_ELEMENTS'] else array[]::text[] end $$;
    grant execute on function private.wall_document_errors(jsonb) to authenticated;
    create table public.wall_assets (asset_id uuid primary key default gen_random_uuid(), entity_id uuid not null references public.entities(entity_id) on delete cascade,
      storage_path text not null unique, mime_type text not null, byte_size integer not null, width integer not null, height integer not null, created_at timestamptz not null default now());
    -- F8-B1's rendition registry, with its real foreign key behavior
    create table public.wall_video_renditions (rendition_id uuid primary key default gen_random_uuid(), asset_id uuid references public.wall_assets(asset_id) on delete set null);`);
  await db.exec(slice(persistence, "create table public.wall_drafts (", "\n);"));
  await db.exec(slice(persistence, "create function private.wall_owned_entity_id()", "\n$$;"));
  await db.exec(slice(assetsSql, "create function private.wall_document_asset_ids(doc jsonb)", "'string'; $$;"));
  await db.exec(slice(publishing, "create table public.wall_publications (", "\n);"));
  await db.exec("alter table public.wall_publications add column is_enabled boolean not null default true;");
  await db.exec(slice(fonts, "create table public.wall_fonts (", "\n);"));
  await db.exec(slice(fonts, "create function private.wall_document_font_refs(doc jsonb)", "'string'; $$;"));
  await db.exec(slice(fonts, "create function private.wall_drafts_font_refs_check()", "execute function private.wall_drafts_font_refs_check();"));
  await db.exec(MIGRATION);
  await db.exec(`insert into public.entities values ('${ENTITY}', 'SOLO', 'PUBLIC', 'owner'), ('${OTHER_ENTITY}', 'SOLO', 'PUBLIC', 'other');
    insert into public.entity_memberships values ('${ENTITY}', '${OWNER}', 'OWNER'), ('${OTHER_ENTITY}', '${OTHER}', 'OWNER');
    insert into public.wall_assets (asset_id, entity_id, storage_path, mime_type, byte_size, width, height) values
      ('${IMG}', '${ENTITY}', '${OWNER}/img.png', 'image/png', 2000, 640, 360), ('${VID}', '${ENTITY}', '${OWNER}/vid.mp4', 'video/mp4', 900000, 1920, 1080),
      ('${SPARE}', '${ENTITY}', '${OWNER}/spare.webp', 'image/webp', 1000, 10, 10), ('${THEIRS}', '${OTHER_ENTITY}', '${OTHER}/theirs.png', 'image/png', 1000, 10, 10);
    insert into public.wall_video_renditions (asset_id) values ('${VID}');
    insert into public.wall_fonts (font_id, owner_id, entity_id, storage_path, sha256, byte_size, display_name, license_acknowledged_at) values
      ('${FONT}', '${OWNER}', '${ENTITY}', '${OWNER}/fonts/${"1".repeat(64)}.woff2', '${"1".repeat(64)}', 9000, 'Neon Sans', now()),
      ('${FONT2}', '${OWNER}', '${ENTITY}', '${OWNER}/fonts/${"2".repeat(64)}.woff2', '${"2".repeat(64)}', 9000, 'Spare Font', now());`);
  const as = role => db.exec(role === "admin" ? "reset role; set request.jwt.claim.sub = '';" : role === "anon" ? "set role anon; set request.jwt.claim.sub = '';" : `set role authenticated; set request.jwt.claim.sub = '${role}';`);
  const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
  const fails = async (sql, params, code) => { await assert.rejects(db.query(sql, params), error => { assert.match(String(error.message), new RegExp(code)); return true; }); };
  const setDraft = async (document, revision = 5) => { await as("admin"); await db.query(`insert into public.wall_drafts (entity_id, document, revision) values ($1, $2, $3) on conflict (entity_id) do update set document = excluded.document, revision = excluded.revision`, [ENTITY, document, revision]); };
  const publish = async (document, draftRevision = 5) => { await as("admin"); await db.query(`insert into public.wall_publications (entity_id, document, draft_revision) values ($1, $2, $3) on conflict (entity_id) do update set document = excluded.document, draft_revision = excluded.draft_revision`, [ENTITY, document, draftRevision]); };
  const state = async () => {
    await as("admin");
    return {
      draft: await one("select document, revision from public.wall_drafts where entity_id = $1", [ENTITY]),
      published: await one("select document, draft_revision from public.wall_publications where entity_id = $1", [ENTITY]),
      assets: (await db.query("select asset_id from public.wall_assets where entity_id = $1 order by asset_id", [ENTITY])).rows.map(row => row.asset_id),
      fonts: (await db.query("select font_id from public.wall_fonts where owner_id = $1 order by font_id", [OWNER])).rows.map(row => row.font_id),
    };
  };
  const delAsset = async (id, resolve, revision = null, who = OWNER) => { await as(who); try { return await one("select * from public.delete_my_wall_asset_resolving($1, $2, $3)", [id, resolve, revision]); } finally { await as("admin"); } };
  const delFont = async (id, resolve, revision = null, who = OWNER) => { await as(who); try { return await one("select * from public.delete_my_wall_font_resolving($1, $2, $3)", [id, resolve, revision]); } finally { await as("admin"); } };
  return { db, as, one, fails, setDraft, publish, state, delAsset, delFont };
}

// A Wall using IMG in several places across stages, VID as the Whole Wall background, and FONT on two texts (one grouped with a kept shape).
const el = (id, type, payload, extra = {}) => ({ id, type, x: 10, y: 20, width: 100, height: 50, z: 0, rotation: 0, payload, ...extra });
const image = (assetId, extra = {}) => ({ assetId, fit: "cover", posX: 50, posY: 50, opacity: 1, ...extra });
const text = (words, fontRef, extra = {}) => ({ text: words, fontFamily: "orbitron", fontSize: 80, color: "#ffffff", ...(fontRef ? { fontRef } : {}), ...extra });
function wall() {
  return {
    version: 1, canvas: { width: 1080, height: 1920 },
    background: { kind: "video", assetId: VID, fit: "cover", posX: 50, posY: 50, opacity: 1 },
    stages: [
      { id: "stage_1", background: { kind: "image", assetId: IMG, fit: "contain", posX: 50, posY: 50, opacity: 1 }, elements: [
        el("t1", "text", text("Hello", `font:${FONT}`), { groupId: "g1" }), el("r1", "rect", { fill: "#ff0000" }, { groupId: "g1", z: 1 }), el("i1", "image", image(IMG), { z: 2 }),
      ] },
      { id: "stage_2", elements: [el("i2", "image", image(IMG, { media: "video" })), el("i3", "image", image(SPARE)), el("t2", "text", text("World", `font:${FONT}`, { glow: { color: "#62e7ff", blur: 22 } }))] },
      { id: "stage_3", background: { kind: "color", color: "#101010" }, elements: [] },
    ],
  };
}

test("shape: two owner RPCs for signed-in users only; the transforms and implementations are not callable by clients; the old refusing RPCs are untouched", async () => {
  assert.doesNotMatch(MIGRATION, /create or replace function|drop function|alter table|delete_my_wall_asset_impl\(|delete_my_wall_font_impl\(/, "additive: no existing function or table changes");
  assert.match(MIGRATION, /for update;[\s\S]*for update;[\s\S]*for update;/, "the resource, the draft and the publication rows are locked (repeated / concurrent deletes serialize)");
  assert.match(MIGRATION, /perform pg_advisory_xact_lock\(hashtextextended\('usage:' \|\| caller::text, 0\)\);/, "fonts take the same per-account lock as font registration");
  assert.doesNotMatch(MIGRATION, /52428800/);
  const f = await fixture(); try {
    await f.as("anon");
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, false, null)", [SPARE], "permission denied");
    await f.fails("select * from public.delete_my_wall_font_resolving($1, false, null)", [FONT2], "permission denied");
    await f.as(OWNER);
    await f.fails("select private.wall_document_strip_asset('{}'::jsonb, 'x')", [], "permission denied");
    await f.fails("select private.wall_jsonb_strip_font_ref('{}'::jsonb, 'x')", [], "permission denied");
  } finally { await f.db.close(); }
});

test("1 / 6 not in use: an asset and a font that no saved or published Wall uses are deleted at once; the storage path comes back for the gateway delete", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall()); await f.publish(wall());
    assert.equal((await f.delAsset(SPARE, false)).deleted, false, "(while stage 2 still shows it, it is in use)");
    await f.setDraft({ ...wall(), stages: wall().stages.map(stage => ({ ...stage, elements: stage.elements.filter(element => element.id !== "i3") })) }, 5);
    await f.publish({ ...wall(), stages: wall().stages.map(stage => ({ ...stage, elements: stage.elements.filter(element => element.id !== "i3") })) }, 5);
    const before = await f.state();
    const gone = await f.delAsset(SPARE, false);
    assert.deepEqual({ ...gone }, { deleted: true, in_draft: false, in_published: false, storage_path: `${OWNER}/spare.webp`, draft_revision: 5, published_changed: false });
    const after = await f.state();
    assert.deepEqual(after.draft, before.draft, "the draft is untouched (same document, same revision)");
    assert.deepEqual(after.published, before.published);
    assert.ok(!after.assets.includes(SPARE));
    const font = await f.delFont(FONT2, false);
    assert.equal(font.deleted, true); assert.equal(font.storage_path, `${OWNER}/fonts/${"2".repeat(64)}.woff2`);
    assert.deepEqual((await f.state()).fonts, [FONT]);
  } finally { await f.db.close(); }
});

test("7 in use, not confirmed: nothing changes and the answer says where it is used (saved draft / published Wall) - no error", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall()); await f.publish({ ...wall(), background: undefined }, 4);
    const before = await f.state();
    const img = await f.delAsset(IMG, false);
    assert.deepEqual([img.deleted, img.in_draft, img.in_published, img.storage_path], [false, true, true, null]);
    const vid = await f.delAsset(VID, false);
    assert.deepEqual([vid.deleted, vid.in_draft, vid.in_published], [false, true, false], "the published snapshot does not use the video");
    const font = await f.delFont(FONT, false);
    assert.deepEqual([font.deleted, font.in_draft, font.in_published], [false, true, true]);
    assert.deepEqual(await f.state(), before, "nothing at all changed");
  } finally { await f.db.close(); }
});

test("2 / 3 / 4 confirmed: one asset used as the Whole Wall / stage background and by elements on several stages is removed from the draft AND the published Wall, then deleted", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall(), 5); await f.publish(wall(), 5);
    const answer = await f.delAsset(IMG, true, 5);
    assert.deepEqual({ ...answer }, { deleted: true, in_draft: true, in_published: true, storage_path: `${OWNER}/img.png`, draft_revision: 6, published_changed: true });
    const { draft, published, assets } = await f.state();
    assert.equal(draft.revision, 6, "the draft moved on by exactly one revision");
    const expected = ops.removeAssetReferences(wall(), IMG).doc;
    assert.deepEqual(draft.document, expected, "exactly the editor's transform");
    assert.equal(draft.document.stages[0].background, undefined, "stage 1's own background is gone (it falls back to the Whole Wall background)");
    assert.deepEqual(draft.document.stages[0].elements.map(element => element.id), ["t1", "r1"], "the picture layer is gone; the group of text + shape is untouched");
    assert.deepEqual(draft.document.stages[1].elements.map(element => element.id), ["i3", "t2"], "the video-media layer using it is gone; other assets stay");
    assert.deepEqual(draft.document.background, wall().background, "the Whole Wall video background (another asset) is untouched");
    assert.deepEqual(draft.document.stages[2], wall().stages[2]);
    assert.deepEqual(published.document, expected, "visitors never see a broken reference");
    assert.equal(published.draft_revision, 6, "a publication that was up to date stays up to date");
    assert.ok(!assets.includes(IMG));
    // the Whole Wall background asset (a video with a rendition)
    const video = await f.delAsset(VID, true, 6);
    assert.equal(video.deleted, true);
    const after = await f.state();
    assert.equal(after.draft.document.background, undefined, "the Whole Wall background is removed (none)");
    assert.equal((await f.one("select asset_id from public.wall_video_renditions")).asset_id, null, "its rendition is detached; the existing F8-B1 sweep removes the object");
  } finally { await f.db.close(); }
});

test("an older publication is resolved too but keeps its revision (it still differs from the draft); an asset only the published Wall uses needs no draft revision", async () => {
  const f = await fixture(); try {
    const draftDoc = ops.removeAssetReferences(wall(), IMG).doc;
    await f.setDraft(draftDoc, 9); await f.publish(wall(), 7);
    const answer = await f.delAsset(IMG, true, null);
    assert.deepEqual([answer.deleted, answer.in_draft, answer.in_published, answer.draft_revision], [true, false, true, 9]);
    const { draft, published } = await f.state();
    assert.equal(draft.revision, 9, "the draft did not use it: untouched");
    assert.deepEqual(published.document, ops.removeAssetReferences(wall(), IMG).doc);
    assert.equal(published.draft_revision, 7);
  } finally { await f.db.close(); }
});

test("8 failures change nothing: a stale revision, a document that would become invalid, a reference in a place the transform does not know", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall(), 5); await f.publish(wall(), 5);
    const before = await f.state();
    await f.as(OWNER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, 4)", [IMG], "WALL_REVISION_CONFLICT");
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, null)", [IMG], "WALL_REVISION_CONFLICT");
    await f.fails("select * from public.delete_my_wall_font_resolving($1, true, 6)", [FONT], "WALL_REVISION_CONFLICT");
    assert.deepEqual(await f.state(), before, "a conflict changes nothing (the editor must hold the latest saved revision)");
    // the published snapshot would become invalid -> the draft change is rolled back with it
    await f.publish({ ...wall(), requireElements: true, stages: [{ id: "stage_1", elements: [el("only", "image", image(IMG))] }] }, 5);
    const mid = await f.state();
    await f.as(OWNER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, 5)", [IMG], "INVALID_WALL_DOCUMENT");
    assert.deepEqual(await f.state(), mid, "all or nothing: the draft, the publication and the asset row are as they were");
    // a reference somewhere the transform does not handle aborts rather than leaving it dangling
    await f.setDraft({ ...wall(), extra: { assetId: SPARE } }, 5); await f.publish(wall(), 5);
    const odd = await f.state();
    await f.as(OWNER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, 5)", [SPARE], "WALL_REFERENCE_UNRESOLVED");
    assert.deepEqual(await f.state(), odd);
  } finally { await f.db.close(); }
});

test("9 permissions: another account can neither see, delete nor resolve the owner's assets and fonts; an owner cannot touch another account's", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall(), 5);
    const before = await f.state();
    await f.as(OTHER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, 5)", [IMG], "WALL_ASSET_NOT_FOUND");
    await f.fails("select * from public.delete_my_wall_font_resolving($1, true, 5)", [FONT], "WALL_FONT_NOT_FOUND");
    await f.as(OWNER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, false, null)", [THEIRS], "WALL_ASSET_NOT_FOUND");
    await f.as("admin");
    assert.deepEqual(await f.state(), before);
    assert.equal((await f.one("select count(*)::int n from public.wall_assets where asset_id = $1", [THEIRS])).n, 1);
    // a repeated click after a deletion: the second call finds nothing and changes nothing
    await f.delAsset(SPARE, true, 5);
    await f.as(OWNER);
    await f.fails("select * from public.delete_my_wall_asset_resolving($1, true, 6)", [SPARE], "WALL_ASSET_NOT_FOUND");
  } finally { await f.db.close(); }
});

test("5 confirmed font: every text keeps its words, position, styling and its library font (the fallback); the draft trigger accepts the result; the row is deleted", async () => {
  const f = await fixture(); try {
    await f.setDraft(wall(), 5); await f.publish(wall(), 5);
    const answer = await f.delFont(FONT, true, 5);
    assert.deepEqual([answer.deleted, answer.in_draft, answer.in_published, answer.draft_revision, answer.published_changed], [true, true, true, 6, true]);
    const { draft, published, fonts } = await f.state();
    const t1 = draft.document.stages[0].elements.find(element => element.id === "t1"), t2 = draft.document.stages[1].elements.find(element => element.id === "t2");
    assert.equal(t1.payload.fontRef, undefined); assert.equal(t2.payload.fontRef, undefined);
    assert.deepEqual(t1.payload, { text: "Hello", fontFamily: "orbitron", fontSize: 80, color: "#ffffff" }, "content and styling kept; the catalog font is the fallback");
    assert.deepEqual(t2.payload.glow, { color: "#62e7ff", blur: 22 });
    assert.deepEqual([t1.x, t1.y, t1.groupId], [10, 20, "g1"], "position and grouping kept");
    assert.deepEqual(draft.document, ops.removeFontReferences(wall(), FONT).doc, "exactly the editor's transform");
    assert.deepEqual(published.document, ops.removeFontReferences(wall(), FONT).doc);
    assert.equal(published.draft_revision, 6);
    assert.deepEqual(fonts, [FONT2]);
    assert.deepEqual(draft.document.stages[0].elements.find(element => element.id === "i1"), wall().stages[0].elements[2], "unrelated content untouched");
    // the draft no longer names a deleted font, so saving it again passes the reference trigger
    await f.db.query("update public.wall_drafts set document = document where entity_id = $1", [ENTITY]);
  } finally { await f.db.close(); }
});

test("the database transforms equal the editor's on varied documents (pure removal, nothing else changes)", async () => {
  const f = await fixture(); try {
    const docs = [wall(), ops.removeAssetReferences(wall(), VID).doc, { ...wall(), stages: [{ id: "s", elements: [] }] }, { version: 1, canvas: { width: 1, height: 1 }, stages: [{ id: "s", background: { kind: "image", assetId: SPARE, overlay: { color: "#000000", opacity: 0.4 } }, elements: [el("x", "image", image(SPARE, { slice: { scale: 2, items: [1, 2] } }))] }] }];
    for (const doc of docs) for (const id of [IMG, VID, SPARE, THEIRS]) {
      const sql = (await f.one("select private.wall_document_strip_asset($1, $2) d", [doc, id])).d;
      assert.deepEqual(sql, JSON.parse(JSON.stringify(ops.removeAssetReferences(doc, id).doc)), `asset ${id}`);
    }
    for (const doc of docs) for (const id of [FONT, FONT2]) {
      const sql = (await f.one("select private.wall_jsonb_strip_font_ref($1, $2) d", [doc, `font:${id}`])).d;
      assert.deepEqual(sql, ops.removeFontReferences(doc, id).doc, `font ${id}`);
    }
  } finally { await f.db.close(); }
});
