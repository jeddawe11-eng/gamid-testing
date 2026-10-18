// Custom Wall fonts (2026-10-18): the REAL migration (supabase/migrations/20261018120000_wall_custom_fonts.sql) on an isolated Postgres (PGlite), after the real
// usage-gateway migration it patches. Only pre-existing dependencies are stubbed. Covers ownership and RLS, the 3-font limit (pending uploads included), deduplication,
// quota, the draft reference check, deletion refusals, the restrictive delete policy, the visitor read policy and the anonymous published-fonts RPC.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const OWNER = "11111111-1111-4111-8111-111111111111", OTHER = "22222222-2222-4222-8222-222222222222";
const ENTITY = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", OTHER_ENTITY = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const read = name => readFileSync(new URL(`../supabase/migrations/${name}`, import.meta.url), "utf8");
const SHA = n => String(n).repeat(64).slice(0, 64);           // a syntactically valid hex digest per test font
const pathOf = (owner, sha) => `${owner}/fonts/${sha}.woff2`;

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;
  create schema private;create schema storage;create schema auth;create schema realtime;
  grant usage on schema public,private,storage,auth to authenticated,service_role,anon;
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$;
  create function realtime.send(jsonb,text,text,boolean) returns void language sql as $$select$$;
  create table storage.objects(bucket_id text,name text,owner_id text,metadata jsonb,primary key(bucket_id,name));
  create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);
  insert into storage.buckets(id,file_size_limit,allowed_mime_types) values ('avatars',5242880,array['image/webp']),('wall-media',5242880,array['image/png']),('wall-video',52428800,array['video/mp4']),('intro-sources',157286400,array['video/mp4']),('intro-media',15728640,array['video/webm']),('wall-video-derived',209715200,array['video/mp4']);
  alter table storage.objects enable row level security;grant select,insert,update,delete on storage.objects to authenticated,anon;
  create policy legacy_read on storage.objects for select to authenticated using(owner_id=auth.uid()::text);
  create policy legacy_delete on storage.objects for delete to authenticated using(owner_id=auth.uid()::text);
  create table public.intro_processing_jobs(source_path text,state text);grant select on public.intro_processing_jobs to authenticated;
  create table public.entities(entity_id uuid primary key,entity_type text,visibility text,gamid_handle text);
  create table public.entity_memberships(entity_id uuid,user_id uuid,role text);
  create table public.wall_drafts(entity_id uuid,document jsonb);
  create table public.wall_publications(entity_id uuid,document jsonb,is_enabled boolean not null default true);
  create table public.wall_assets(entity_id uuid,mime_type text);
  create table public.crews(crew_id uuid,name text,owner_entity_id uuid);
  create table public.crew_members(crew_id uuid,entity_id uuid,status text);
  create table public.crew_walls(crew_id uuid,stage_count integer);
  create table private.crew_policy(singleton boolean,max_members integer,wall_stage_allowance integer);insert into private.crew_policy values(true,15,2);
  create function private.crew_wall_stage_allowance(uuid) returns integer language sql as $$ select wall_stage_allowance from private.crew_policy $$;
  create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;`);
  for (const name of ["register_verified_wall_asset_impl", "create_wall_video_job_impl", "worker_complete_wall_video_job_impl", "update_my_identity_profile_impl", "queue_my_intro_impl"])
    await db.exec(`create function private.${name}() returns void language plpgsql as $$declare candidate_owner uuid;caller uuid;begin perform 1 from storage.objects o where o.owner_id = caller::text; if (select 0) >= 60 then raise exception 'WALL_ASSET_LIMIT';end if;if (select 0) >= 10 then raise exception 'WALL_VIDEO_LIMIT';end if;end$$;`);
  await db.exec(read("20261004170252_global_usage_gateway.sql"));
  await db.exec(read("20261018120000_wall_custom_fonts.sql"));
  await db.exec(`insert into public.entities values('${ENTITY}','SOLO','DRAFT','owner'),('${OTHER_ENTITY}','SOLO','DRAFT','other');
    insert into public.entity_memberships values('${ENTITY}','${OWNER}','OWNER'),('${OTHER_ENTITY}','${OTHER}','OWNER');
    insert into public.wall_drafts values('${ENTITY}','{"stages":[]}'),('${OTHER_ENTITY}','{"stages":[]}');`);
  const as = async role => db.exec(role === "admin" ? "reset role;" : role.startsWith("user:") ? `set role authenticated;set request.jwt.claim.sub='${role.slice(5)}';` : `set role ${role};set request.jwt.claim.sub='';`);
  const one = async (sql, params) => (await db.query(sql, params)).rows[0];
  const fails = async (sql, params, code) => { await assert.rejects(db.query(sql, params), error => { assert.match(String(error.message), new RegExp(code)); return true; }); };
  // the gateway's sequence for one font, as the service role: reserve -> (storage writes the object) -> complete -> register
  async function upload(owner, sha, size = 20000, name = "Font") {
    await as("service_role");
    const path = pathOf(owner, sha);
    const receipt = (await one("select public.reserve_usage_upload($1,'wall-fonts',$2,$3,'font/woff2') x", [owner, path, size])).x;
    if (receipt.state !== "COMPLETE") {
      await as("admin"); await db.query("insert into storage.objects values('wall-fonts',$1,null,$2)", [path, { size }]); await as("service_role");
      await db.query("select public.usage_upload_action($1,$2,'complete')", [receipt.upload_id, owner]);
    }
    const font = (await one("select public.register_wall_font($1,$2,$3,$4,true) x", [owner, path, sha, name])).x;
    await as("admin");
    return font;
  }
  const doc = refs => ({ stages: [{ id: "s1", elements: refs.map((ref, i) => ({ id: `t${i}`, type: "text", payload: { text: "x", fontFamily: "system-sans", fontRef: ref } })) }] });
  return { db, as, one, fails, upload, doc };
}

test("migration shape on a real Postgres: private 2 MiB WOFF2-only bucket, its own usage category, limit 3", async () => {
  const f = await fixture(); try {
    assert.deepEqual(await f.one("select public, file_size_limit, allowed_mime_types from storage.buckets where id='wall-fonts'"), { public: false, file_size_limit: 2097152, allowed_mime_types: ["font/woff2"] });
    assert.equal((await f.one("select category from private.usage_media_categories where bucket='wall-fonts'")).category, "font");
    assert.equal((await f.one("select private.wall_font_limit() n")).n, 3);
  } finally { await f.db.close(); }
});

test("upload, deduplication and the 3-font limit: an identical font never takes a slot; a 4th distinct font is refused at reservation AND at registration", async () => {
  const f = await fixture(); try {
    const a = await f.upload(OWNER, SHA(1), 20000, "Alpha");
    assert.equal(a.duplicate, false); assert.equal(a.display_name, "Alpha"); assert.equal(a.byte_size, 20000);
    const again = await f.upload(OWNER, SHA(1), 20000, "Alpha copy");
    assert.equal(again.duplicate, true); assert.equal(again.font_id, a.font_id, "same font, same row");
    assert.equal(Number((await f.one("select count(*) n from public.wall_fonts")).n), 1);
    assert.equal(Number((await f.one("select count(*) n from storage.objects where bucket_id='wall-fonts'")).n), 1, "stored once");
    await f.upload(OWNER, SHA(2)); await f.upload(OWNER, SHA(3));
    await f.as("service_role");
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/woff2')", [OWNER, pathOf(OWNER, SHA(4))], "WALL_FONT_LIMIT");
    await f.as("admin"); await f.db.query("insert into storage.objects values('wall-fonts',$1,null,'{\"size\":100}')", [pathOf(OWNER, SHA(4))]); await f.as("service_role");
    await f.fails("select public.register_wall_font($1,$2,$3,'x',true)", [OWNER, pathOf(OWNER, SHA(4)), SHA(4)], "WALL_FONT_LIMIT|WALL_FONT_UPLOAD_NOT_FOUND");
    const reup = (await f.one("select public.reserve_usage_upload($1,'wall-fonts',$2,20000,'font/woff2') x", [OWNER, pathOf(OWNER, SHA(1))])).x;
    assert.equal(reup.state, "COMPLETE", "re-uploading an identical font at 3/3 is accepted and stores nothing new");
    await f.as("admin");
    assert.equal(Number((await f.one("select count(*) n from public.wall_fonts where owner_id=$1", [OWNER])).n), 3);
    assert.equal(Number((await f.one("select count(*) n from public.wall_fonts where owner_id=$1", [OTHER])).n), 0, "the limit is per account");
    await f.upload(OTHER, SHA(4));
  } finally { await f.db.close(); }
});

test("concurrency semantics: an in-flight (reserved, not yet registered) font holds a slot, so two simultaneous uploads cannot pass the limit", async () => {
  const f = await fixture(); try {
    await f.upload(OWNER, SHA(1)); await f.upload(OWNER, SHA(2));
    await f.as("service_role");
    await f.db.query("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/woff2')", [OWNER, pathOf(OWNER, SHA(5))]);
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/woff2')", [OWNER, pathOf(OWNER, SHA(6))], "WALL_FONT_LIMIT");
    const same = (await f.one("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/woff2') x", [OWNER, pathOf(OWNER, SHA(5))])).x;
    assert.equal(same.state, "ACTIVE", "the in-flight upload itself may continue (same path)");
    // the reservation and registration share the per-account advisory lock of every usage reservation
    const migration = read("20261018120000_wall_custom_fonts.sql");
    assert.match(migration, /perform pg_advisory_xact_lock\(hashtextextended\('usage:' \|\| u::text, 0\)\);/);
    assert.match((await f.one("select pg_get_functiondef('private.reserve_usage_upload(uuid,text,text,bigint,text)'::regprocedure) d")).d, /pg_advisory_xact_lock\(hashtextextended\('usage:'\|\|u::text,0\)\);[\s\S]*WALL_FONT_LIMIT/);
  } finally { await f.db.close(); }
});

test("quota: a font that does not fit the 200 MB account allowance is refused before anything is stored", async () => {
  const f = await fixture(); try {
    await f.db.query("insert into storage.objects values('wall-media',$1,$2,'{\"size\":199990000}')", [`${OWNER}/big.png`, OWNER]);
    await f.as("service_role");
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,20000,'font/woff2')", [OWNER, pathOf(OWNER, SHA(1))], "ACCOUNT_STORAGE_QUOTA_EXCEEDED");
    await f.as("admin");
    const ok = await f.upload(OWNER, SHA(2), 9000);
    assert.equal(ok.duplicate, false, "a font that fits is accepted");
    await f.as(`user:${OWNER}`);
    const usage = (await f.one("select public.get_my_usage() x")).x;
    assert.equal(usage.storage.used_bytes, 199999000, "font bytes count toward the account quota");
    assert.equal(usage.media.font, 9000, "own Usage category");
    assert.deepEqual(usage.quotas.find(q => q.key === "wall.fonts"), { key: "wall.fonts", name: "Custom Fonts", used: 1, limit: 3 });
  } finally { await f.db.close(); }
});

test("the gateway checks: bucket type and size from the bucket, path = owner + SHA-256, licence required, non-font buckets unchanged", async () => {
  const f = await fixture(); try {
    await f.as("service_role");
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/ttf')", [OWNER, pathOf(OWNER, SHA(1))], "INVALID_UPLOAD");
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,2097153,'font/woff2')", [OWNER, pathOf(OWNER, SHA(1))], "INVALID_UPLOAD");
    await f.fails("select public.reserve_usage_upload($1,'wall-fonts',$2,100,'font/woff2')", [OWNER, pathOf(OTHER, SHA(1))], "INVALID_UPLOAD_PATH");
    await f.fails("select public.register_wall_font($1,$2,$3,'x',true)", [OWNER, pathOf(OWNER, SHA(1)), SHA(2)], "INVALID_UPLOAD_PATH");
    await f.fails("select public.register_wall_font($1,$2,$3,'x',false)", [OWNER, pathOf(OWNER, SHA(1)), SHA(1)], "WALL_FONT_LICENSE_REQUIRED");
    await f.fails("select public.register_wall_font($1,$2,$3,'x',true)", [OWNER, pathOf(OWNER, SHA(1)), SHA(1)], "WALL_FONT_UPLOAD_NOT_FOUND");
    const image = (await f.one("select public.reserve_usage_upload($1,'wall-media',$2,100,'image/png') x", [OWNER, `${OWNER}/a.png`])).x;
    assert.equal(image.state, "ACTIVE", "other buckets reserve exactly as before");
    await f.fails("select public.reserve_usage_upload($1,'not-a-bucket',$2,100,'image/png')", [OWNER, `${OWNER}/a.png`], "INVALID_UPLOAD");
    await f.as("admin");
    const named = await f.upload(OWNER, SHA(7), 500, "  Evil\u0007Name\u001b with a very long name that keeps going and going past sixty chars  ");   // (NUL never reaches the database: the gateway strips control characters first)
    assert.equal(named.display_name, "EvilName with a very long name that keeps going and going pa", "control characters stripped, trimmed, 60 characters");
    assert.ok(named.display_name.length <= 60);
  } finally { await f.db.close(); }
});

test("ownership and RLS: owner-only list and delete RPCs, no direct table access, the service-only registration is closed to clients", async () => {
  const f = await fixture(); try {
    const a = await f.upload(OWNER, SHA(1), 1000, "Alpha");
    await f.as(`user:${OWNER}`);
    const mine = (await f.one("select public.list_my_wall_fonts() x")).x;
    assert.equal(mine.limit, 3); assert.deepEqual(mine.fonts.map(x => [x.font_id, x.display_name, x.in_draft, x.in_published]), [[a.font_id, "Alpha", false, false]]);
    await f.fails("select * from public.wall_fonts", [], "permission denied");
    await f.fails("select public.register_wall_font($1,$2,$3,'x',true)", [OWNER, pathOf(OWNER, SHA(2)), SHA(2)], "permission denied");
    await f.as(`user:${OTHER}`);
    assert.deepEqual((await f.one("select public.list_my_wall_fonts() x")).x.fonts, [], "another account sees nothing");
    await f.fails("select public.delete_my_wall_font($1)", [a.font_id], "WALL_FONT_NOT_FOUND");
    await f.as("anon");
    await f.fails("select public.list_my_wall_fonts()", [], "permission denied");
    await f.fails("select public.delete_my_wall_font($1)", [a.font_id], "permission denied");
  } finally { await f.db.close(); }
});

test("drafts may name only their owner's fonts; deletion is refused while the saved draft or any published Wall uses the font", async () => {
  const f = await fixture(); try {
    const a = await f.upload(OWNER, SHA(1)), other = await f.upload(OTHER, SHA(2));
    const ref = `font:${a.font_id}`;
    await f.db.query("update public.wall_drafts set document=$1 where entity_id=$2", [f.doc([ref]), ENTITY]);
    await f.fails("update public.wall_drafts set document=$1 where entity_id=$2", [f.doc([`font:${other.font_id}`]), ENTITY], "WALL_FONT_NOT_FOUND");
    await f.fails("update public.wall_drafts set document=$1 where entity_id=$2", [f.doc(["font:../../etc"]), ENTITY], "WALL_FONT_NOT_FOUND");
    await f.as(`user:${OWNER}`);
    await f.fails("select public.delete_my_wall_font($1)", [a.font_id], "WALL_FONT_IN_USE");
    await f.as("admin");
    await f.db.query("insert into public.wall_publications values($1,$2,false)", [ENTITY, f.doc([ref])]);
    await f.db.query("update public.wall_drafts set document='{\"stages\":[]}' where entity_id=$1", [ENTITY]);
    await f.as(`user:${OWNER}`);
    await f.fails("select public.delete_my_wall_font($1)", [a.font_id], "WALL_FONT_PUBLISHED");
    assert.equal((await f.one("select public.list_my_wall_fonts() x")).x.fonts[0].in_published, true);
    await f.as("admin");
    await f.db.query("update public.wall_publications set document='{\"stages\":[]}' where entity_id=$1", [ENTITY]);
    await f.as(`user:${OWNER}`);
    assert.equal((await f.one("select public.delete_my_wall_font($1) p", [a.font_id])).p, pathOf(OWNER, SHA(1)), "deleted once no Wall uses it; the path goes back for the gateway delete");
    assert.deepEqual((await f.one("select public.list_my_wall_fonts() x")).x.fonts, [], "its slot is free");
  } finally { await f.db.close(); }
});

test("a registered font object cannot be deleted: not by the gateway's delete check, not directly by its owner", async () => {
  const f = await fixture(); try {
    const a = await f.upload(OWNER, SHA(1));
    const path = pathOf(OWNER, SHA(1));
    await f.as("service_role");
    await f.fails("select public.authorize_usage_delete($1,'wall-fonts',$2)", [OWNER, path], "WALL_FONT_REGISTERED");
    await f.as(`user:${OWNER}`);
    const direct = await f.db.query("delete from storage.objects where bucket_id='wall-fonts' and name=$1 returning name", [path]);
    assert.equal(direct.rows.length, 0, "the restrictive policy keeps it");
    await f.db.query("select public.delete_my_wall_font($1)", [a.font_id]);
    await f.as("service_role");
    await f.db.query("select public.authorize_usage_delete($1,'wall-fonts',$2)", [OWNER, path]);
  } finally { await f.db.close(); }
});

test("visitors: a font object is readable only while the PUBLIC owner's enabled published Wall references it; the anonymous RPC lists exactly those", async () => {
  const f = await fixture(); try {
    const a = await f.upload(OWNER, SHA(1)), b = await f.upload(OWNER, SHA(2));
    const visible = async role => { await f.as(role); const rows = (await f.db.query("select name from storage.objects where bucket_id='wall-fonts' order by name")).rows.map(r => r.name); await f.as("admin"); return rows; };
    const listed = async () => { await f.as("anon"); const rows = (await f.db.query("select font_id from public.get_public_wall_fonts('owner')")).rows.map(r => r.font_id); await f.as("admin"); return rows; };
    await f.db.query("insert into public.wall_publications values($1,$2,true)", [ENTITY, f.doc([`font:${a.font_id}`])]);
    assert.deepEqual(await visible("anon"), [], "a DRAFT identity's published Wall is not public");
    await f.db.query("update public.entities set visibility='PUBLIC' where entity_id=$1", [ENTITY]);
    assert.deepEqual(await visible("anon"), [pathOf(OWNER, SHA(1))], "exactly the referenced font, never the rest of the library");
    assert.deepEqual(await visible(`user:${OTHER}`), [pathOf(OWNER, SHA(1))], "another signed-in visitor gets the same, nothing more");
    assert.deepEqual(await listed(), [a.font_id]);
    await f.db.query("update public.wall_publications set is_enabled=false where entity_id=$1", [ENTITY]);
    assert.deepEqual(await visible("anon"), [], "a disabled Wall exposes nothing");
    assert.deepEqual(await listed(), []);
    assert.ok(b.font_id);
  } finally { await f.db.close(); }
});

test("cleanup: an unregistered font object older than an hour is reported for the owner's gateway cleanup; registered fonts never are", async () => {
  const f = await fixture(); try {
    await f.upload(OWNER, SHA(1));
    await f.as("service_role");
    const path = pathOf(OWNER, SHA(2));
    const receipt = (await f.one("select public.reserve_usage_upload($1,'wall-fonts',$2,300,'font/woff2') x", [OWNER, path])).x;
    await f.as("admin"); await f.db.query("insert into storage.objects values('wall-fonts',$1,null,'{\"size\":300}')", [path]); await f.as("service_role");
    await f.db.query("select public.usage_upload_action($1,$2,'complete')", [receipt.upload_id, OWNER]);
    assert.deepEqual((await f.one("select public.usage_font_orphans($1) x", [OWNER])).x, [], "not before an hour");
    await f.as("admin"); await f.db.query("update private.usage_uploads set updated_at=now()-interval '2 hours' where path=$1", [path]); await f.as("service_role");
    assert.deepEqual((await f.one("select public.usage_font_orphans($1) x", [OWNER])).x, [path]);
    await f.as(`user:${OWNER}`);
    await f.fails("select public.usage_font_orphans($1)", [OWNER], "permission denied");
  } finally { await f.db.close(); }
});
