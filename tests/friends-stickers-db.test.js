// Friends Stickers V1 (2026-10-24): the migration's rules, run in an isolated PGlite Postgres with minimal stand-ins for the accepted tables and functions it uses
// (entities, memberships, Wall drafts / publications, notifications). The clip-link rule is checked against the browser's parseStickerClip on one corpus.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { stickerSizePercent } from "../dist/wall/stickers.js";
import { parseStickerClip } from "../dist/wall-kit/embed/providers/clip-links.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261024100000_friends_stickers_v1.sql");
const U = { owner: "11111111-1111-4111-8111-111111111111", alice: "22222222-2222-4222-8222-222222222222", bob: "33333333-3333-4333-8333-333333333333", ghost: "44444444-4444-4444-8444-444444444444", priv: "55555555-5555-4555-8555-555555555555" };
const E = { owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", alice: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bob: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", priv: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
const wall = (...types) => ({ schemaVersion: 1, canvas: { width: 1000, height: 1778 }, stages: types.map((type, i) => ({ id: `stage_${i + 1}`, ...(type === "friends" ? { type } : {}), elements: [] })) });

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth;
    grant usage on schema public, private, auth to anon, authenticated, service_role;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    grant execute on function auth.uid() to anon, authenticated;
    create type public.entity_visibility as enum ('DRAFT', 'PRIVATE', 'PUBLIC');
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, display_name text, avatar_media_reference text, visibility public.entity_visibility);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    create table public.wall_drafts (wall_draft_id uuid primary key default gen_random_uuid(), entity_id uuid unique, document jsonb, revision bigint default 1, created_at timestamptz default now(), updated_at timestamptz default now());
    create table public.wall_publications (entity_id uuid primary key, document jsonb, draft_revision bigint, published_at timestamptz default now(), is_enabled boolean default true);
    create table public.wall_assets (asset_id uuid, entity_id uuid, mime_type text);
    create table public.notification_types (type_key text primary key, producer text not null, destination text, active boolean not null default true);
    create table public.notifications (notification_id bigserial primary key, recipient_entity_id uuid, actor_entity_id uuid, type_key text, subject_id uuid, context jsonb);
    create function private.normalize_handle(candidate text) returns text language sql immutable set search_path = '' as $$ select lower(trim(both from candidate)); $$;
    create function private.notify(candidate_recipient uuid, candidate_actor uuid, candidate_type text, candidate_subject uuid, candidate_context jsonb)
    returns bigint language plpgsql volatile security definer set search_path = '' as $$
    declare created bigint;
    begin
      if candidate_recipient is null or candidate_recipient is not distinct from candidate_actor then return null; end if;
      if not exists (select 1 from public.notification_types t where t.type_key = candidate_type and t.active) then raise exception using errcode = '22023', message = 'UNKNOWN_NOTIFICATION_TYPE'; end if;
      insert into public.notifications (recipient_entity_id, actor_entity_id, type_key, subject_id, context) values (candidate_recipient, candidate_actor, candidate_type, candidate_subject, candidate_context) returning notification_id into created;
      return created;
    end; $$;
    create function private.wall_owned_entity_id() returns uuid language plpgsql stable security definer set search_path = '' as $$
    declare caller uuid := (select auth.uid()); owned uuid;
    begin
      if caller is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
      select e.entity_id into owned from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id where m.user_id = caller and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1;
      if owned is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if;
      return owned;
    end; $$;
    -- the accepted document rules are covered elsewhere: here every document is valid and references no asset
    create function private.wall_document_errors(doc jsonb) returns text[] language sql immutable as $$ select array[]::text[] $$;
    create function private.wall_stage_allowance(candidate_entity uuid) returns integer language sql stable as $$ select 3 $$;
    create function private.wall_document_asset_ids(doc jsonb) returns text[] language sql immutable as $$ select array[]::text[] $$;
    create function private.wall_document_video_asset_ids(doc jsonb) returns text[] language sql immutable as $$ select array[]::text[] $$;
    create function private.wall_document_picture_asset_ids(doc jsonb) returns text[] language sql immutable as $$ select array[]::text[] $$;
    insert into public.entities values
      ('${E.owner}', 'SOLO', 'wallowner', 'Wall Owner', '${U.owner}/avatar.jpg', 'PUBLIC'),
      ('${E.alice}', 'SOLO', 'alice', 'Alice', '${U.alice}/avatar-1.jpg', 'PUBLIC'),
      ('${E.bob}', 'SOLO', 'bob', 'Bob', null, 'PUBLIC'),
      ('${E.priv}', 'SOLO', 'quiet', 'Quiet', null, 'PRIVATE');
    insert into public.entity_memberships values ('${E.owner}', '${U.owner}', 'OWNER'), ('${E.alice}', '${U.alice}', 'OWNER'), ('${E.bob}', '${U.bob}', 'OWNER'), ('${E.priv}', '${U.priv}', 'OWNER');`);
  await db.query("insert into public.wall_drafts (entity_id, document) values ($1, $2), ($3, $4)", [E.owner, wall("my", "friends", "friends"), E.alice, wall("my")]);
  await db.query("insert into public.wall_publications (entity_id, document) values ($1, $2), ($3, $4)", [E.owner, wall("my", "friends", "friends"), E.alice, wall("my")]);
  await db.exec(migration);
  return db;
}

// runs as a signed-in user (or anonymously when user is null), always back to the superuser after
async function as(db, user, sql, params = []) {
  await db.exec(user ? `set role authenticated; select set_config('request.jwt.claim.sub', '${user}', false);` : "set role anon; select set_config('request.jwt.claim.sub', '', false);");
  try { return (await db.query(sql, params)).rows; } finally { await db.exec("reset role; select set_config('request.jwt.claim.sub', '', false);"); }
}
const failure = async promise => { try { await promise; return null; } catch (error) { return error.message; } };
const send = (db, user, { handle = "wallowner", stage = "stage_2", key = "legend", x = 500, y = 700, clip = null } = {}) =>
  as(db, user, "select public.send_wall_sticker($1, $2, $3, $4, $5, $6) as id", [handle, stage, key, x, y, clip]).then(rows => rows[0].id);
const review = (db, id, approve, user = U.owner) => as(db, user, "select public.review_wall_sticker($1, $2) as s", [id, approve]).then(rows => rows[0].s);
const mine = db => as(db, U.owner, "select * from public.get_my_wall_stickers()");
const visible = (db, handle = "wallowner") => as(db, null, "select * from public.get_public_wall_stickers($1)", [handle]);

const CLIP_CORPUS = [
  null, "", "   ", "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtube.com/watch?v=dQw4w9WgXcQ&t=42s", "https://m.youtube.com/watch?feature=share&v=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=AAAAAAAAAAA", "https://youtu.be/dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?si=abc", "https://www.youtube.com/shorts/dQw4w9WgXcQ",
  "https://www.youtube.com/clip/UgkxAbCdEfGhIjKlMnOpQrStUvWx", "https://www.youtube.com/watch?v=short", "https://WWW.YouTube.com/watch?v=dQw4w9WgXcQ#t=5",
  "https://clips.twitch.tv/FunnyClipSlug-AbC123", "https://www.twitch.tv/SomeStreamer/clip/FunnyClipSlug-AbC123?filter=clips", "https://m.twitch.tv/videos/1234567890",
  "https://twitch.tv/videos/12", "https://medal.tv/games/valorant/clips/abc123XYZ/ace-clutch?invite=x", "https://medal.tv/clips/abc123XYZ", "https://www.medal.tv/clips/abc123XYZ/nice",
  "https://medal.tv/games/Valorant/clips/abc123XYZ", "http://www.youtube.com/watch?v=dQw4w9WgXcQ", "javascript:alert(1)", "https://evil.example/watch?v=dQw4w9WgXcQ",
  "https://youtube.com.evil.example/watch?v=dQw4w9WgXcQ", "https://user:pass@www.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com:8443/watch?v=dQw4w9WgXcQ",
  "https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=abc", "https://www.youtube.com/watch?v=dQw4w9WgXcQ\"><script>", "https://www.youtube.com/watch?v=dQw4w9WgX cQ",
  " https://youtu.be/dQw4w9WgXcQ\t", "https://youtu.be/dQw4w9WgXcQ ", "https://www.youtube.com/", "https://www.twitch.tv/somebody", "https://medal.tv/",
  `https://www.youtube.com/watch?v=dQw4w9WgXcQ&x=${"a".repeat(300)}`, "https://youtu.be/dQw4w9WgXcQ/", "https://www.youtube.com/watch?vv=dQw4w9WgXcQ",
  "https://www.youtube.com/watch?xv=dQw4w9WgXcQ", "https://clips.twitch.tv/ab", "https://medal.tv/clips/abc", "https://medal.tv/clips/abc1/sl%20ug",
];

test("the SQL clip rule gives exactly the browser's answer for every corpus link (the same codes, providers and rebuilt links)", async () => {
  const db = await fixture();
  for (const input of CLIP_CORPUS) {
    const sql = (await db.query("select * from private.wall_sticker_clip($1)", [input])).rows[0];
    const js = parseStickerClip(input);
    const expected = js.ok ? { ok: true, code: null, provider: js.clip?.provider ?? null, url: js.clip?.url ?? null } : { ok: false, code: js.code, provider: null, url: null };
    assert.deepEqual({ ...sql }, expected, JSON.stringify(input));
  }
  assert.equal(parseStickerClip("https://www.youtube.com/watch?v=dQw4w9WgXcQ&v=AAAAAAAAAAA").clip.url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "the first v= names the video");
  assert.equal(parseStickerClip("https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=abc").code, "STICKER_CLIP_UNSUPPORTED", "Discord media links expire: not accepted in V1");
});

test("sending: only a signed-in PUBLIC GamID, only to a Friends Stage of another public, enabled published Wall, a catalog sticker inside the stage area", async () => {
  const db = await fixture();
  assert.match(await failure(send(db, null)), /permission denied/, "anonymous visitors cannot send");
  assert.equal(await failure(send(db, U.priv)), "STICKER_SENDER_NOT_PUBLIC", "a private GamID cannot send (visitors would see its name)");
  assert.equal(await failure(send(db, U.owner)), "STICKER_SELF", "never to my own Wall");
  assert.equal(await failure(send(db, U.alice, { handle: "nobody" })), "STICKER_RECIPIENT_NOT_FOUND");
  assert.equal(await failure(send(db, U.alice, { stage: "stage_1" })), "STICKER_STAGE_NOT_FRIENDS", "a My Stage never takes stickers");
  assert.equal(await failure(send(db, U.alice, { stage: "stage_9" })), "STICKER_STAGE_NOT_FRIENDS");
  assert.equal(await failure(send(db, U.alice, { key: "premium-dragon" })), "STICKER_UNKNOWN");
  assert.equal(await failure(send(db, U.alice, { x: 100 })), "STICKER_POSITION_INVALID");
  assert.equal(await failure(send(db, U.alice, { y: 1700 })), "STICKER_POSITION_INVALID");
  assert.equal(await failure(send(db, U.alice, { clip: "https://evil.example/x" })), "STICKER_CLIP_UNSUPPORTED");
  assert.equal(await failure(send(db, U.alice, { clip: "javascript:alert(1)" })), "STICKER_CLIP_INVALID");
  const id = await send(db, U.alice, { handle: "  WallOwner ", clip: "https://youtu.be/dQw4w9WgXcQ?si=tracking" });
  const row = (await db.query("select * from public.wall_sticker_placements where placement_id = $1", [id])).rows[0];
  assert.equal(row.sender_entity_id, E.alice, "the sender is the authenticated account's own GamID");
  assert.equal(row.status, "pending");
  assert.equal(row.clip_url, "https://www.youtube.com/watch?v=dQw4w9WgXcQ", "the link is stored rebuilt from its accepted parts");
  assert.equal(row.clip_provider, "youtube");
  const notes = (await db.query("select * from public.notifications")).rows;
  assert.deepEqual(notes.map(n => [n.recipient_entity_id, n.actor_entity_id, n.type_key, n.subject_id]), [[E.owner, E.alice, "sticker.request_received", id]]);
  // disabled or private Walls take none
  await db.query("update public.wall_publications set is_enabled = false where entity_id = $1", [E.owner]);
  assert.equal(await failure(send(db, U.bob)), "STICKER_RECIPIENT_NOT_FOUND");
});

test("anti-spam: at most 5 waiting requests from one sender to one Wall, at most 20 sends per sender per hour (technical limits)", async () => {
  const db = await fixture();
  for (let i = 0; i < 5; i++) await send(db, U.alice);
  assert.equal(await failure(send(db, U.alice)), "STICKER_PENDING_LIMIT");
  assert.ok(await send(db, U.bob), "another sender is not affected");
  // decided requests free the waiting slots; the hourly cap still counts them
  for (const { placement_id } of await mine(db)) await review(db, placement_id, false);
  await db.query(`insert into public.wall_sticker_placements (recipient_entity_id, sender_entity_id, stage_id, sticker_key, pos_x, pos_y, status, created_at)
    select $1, $2, 'stage_2', 'mvp', 500, 500, 'rejected', now() - interval '10 minutes' from generate_series(1, 15)`, [E.owner, E.alice]);   // 5 + 15 = 20 this hour
  assert.equal(await failure(send(db, U.alice)), "STICKER_RATE_LIMIT");
  await db.query("update public.wall_sticker_placements set created_at = now() - interval '2 hours' where sender_entity_id = $1", [E.alice]);
  assert.ok(await send(db, U.alice), "an hour later sending works again");
});

test("owner review: only the Wall's owner decides; pending stickers (and their links) never reach visitors; approval needs the Friends Stage on the draft", async () => {
  const db = await fixture();
  const id = await send(db, U.alice, { clip: "https://clips.twitch.tv/FunnyClipSlug" });
  assert.deepEqual(await visible(db), [], "a waiting sticker is not public");
  const queue = await mine(db);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].sender_handle, "alice");
  assert.equal(queue[0].sender_avatar_media_reference, `${U.alice}/avatar-1.jpg`);
  assert.equal(queue[0].clip_url, "https://clips.twitch.tv/FunnyClipSlug", "the owner sees the link before deciding");
  assert.equal(queue[0].stage_in_draft, true);
  assert.equal(await failure(review(db, id, true, U.bob)), "STICKER_NOT_FOUND", "nobody else can decide");
  assert.equal(await failure(as(db, null, "select public.review_wall_sticker($1, true)", [id])), "permission denied for function review_wall_sticker");
  assert.equal(await review(db, id, true), "approved");
  assert.equal(await failure(review(db, id, false)), "STICKER_NOT_PENDING");
  const shown = await visible(db);
  assert.equal(shown.length, 1);
  assert.deepEqual({ handle: shown[0].sender_handle, size: shown[0].size_percent, clip: shown[0].clip_url, provider: shown[0].clip_provider },
    { handle: "alice", size: 100, clip: "https://clips.twitch.tv/FunnyClipSlug", provider: "twitch" });
  assert.deepEqual((await db.query("select type_key, recipient_entity_id from public.notifications order by notification_id")).rows.map(n => [n.type_key, n.recipient_entity_id]),
    [["sticker.request_received", E.owner], ["sticker.approved", E.alice]]);
  // rejection is final and private
  const other = await send(db, U.bob);
  assert.equal(await review(db, other, false), "rejected");
  assert.equal((await visible(db)).length, 1);
  // a request whose Friends Stage the owner since removed cannot be approved (it can still be rejected)
  const late = await send(db, U.bob, { stage: "stage_3" });
  await db.query("update public.wall_drafts set document = $1 where entity_id = $2", [wall("my", "friends"), E.owner]);
  assert.equal((await mine(db)).find(row => row.placement_id === late).stage_in_draft, false);
  assert.equal(await failure(review(db, late, true)), "STICKER_STAGE_GONE");
  assert.equal(await review(db, late, false), "rejected");
});

test("dynamic size: 100% for the newest, 5 points less per newer active sticker, never under 50%; removals give the size back (oldest, middle, newest)", async () => {
  const db = await fixture();
  const ids = [];
  for (let i = 0; i < 5; i++) { const id = await send(db, i % 2 ? U.bob : U.alice); await review(db, id, true); ids.push(id); }
  const sizes = async () => Object.fromEntries((await visible(db)).map(row => [row.placement_id, row.size_percent]));
  assert.deepEqual(Object.values(await sizes()), [80, 85, 90, 95, 100], "five approvals: 80 / 85 / 90 / 95 / 100 (oldest first)");
  const remove = id => as(db, U.owner, "select public.remove_wall_sticker($1)", [id]);
  await remove(ids[0]);   // oldest
  assert.deepEqual(Object.values(await sizes()), [85, 90, 95, 100]);
  await remove(ids[2]);   // middle
  assert.deepEqual(Object.values(await sizes()), [90, 95, 100]);
  await remove(ids[4]);   // newest: the next newest is 100% again
  assert.deepEqual(Object.values(await sizes()), [95, 100]);
  assert.equal(await failure(remove(ids[4])), "STICKER_NOT_FOUND", "a removed sticker cannot be removed twice");
  // a pending or rejected sticker never takes size from the others
  await send(db, U.alice);
  assert.deepEqual(Object.values(await sizes()), [95, 100]);
  // the 50% floor
  for (let i = 0; i < 12; i++) { const id = await send(db, i % 2 ? U.bob : U.alice); await review(db, id, true); }
  const all = Object.values(await sizes());
  assert.equal(all.length, 14);
  assert.equal(Math.min(...all), 50);
  assert.equal(all.at(-1), 100);
  assert.deepEqual(all, all.map((_, i) => stickerSizePercent(all.length - 1 - i)), "the server's sizes are the browser's stickerSizePercent");
  // approval numbers are unique per Wall (concurrent approvals are serialized; the index refuses a duplicate)
  const seqs = (await db.query("select approval_seq from public.wall_sticker_placements where approval_seq is not null order by approval_seq")).rows.map(r => Number(r.approval_seq));
  assert.deepEqual(seqs, seqs.map((_, i) => i + 1));
  assert.match(await failure(db.query("update public.wall_sticker_placements set approval_seq = 1 where approval_seq = 2")), /duplicate key/);
});

test("moving: only the owner, only approved stickers, only inside the stage area; one saved move notifies the sender once, a move to the same place is nothing", async () => {
  const db = await fixture();
  const id = await send(db, U.alice);
  const move = (x, y, user = U.owner) => as(db, user, "select public.move_wall_sticker($1, $2, $3) as moved", [id, x, y]).then(rows => rows[0].moved);
  assert.equal(await failure(move(300, 300)), "STICKER_NOT_FOUND", "a pending sticker is not on the Wall yet");
  await review(db, id, true);
  assert.equal(await failure(move(300, 300, U.alice)), "STICKER_NOT_FOUND", "the sender cannot move it");
  assert.equal(await failure(move(900, 300)), "STICKER_POSITION_INVALID");
  assert.equal(await move(300, 320), true);
  assert.equal(await move(300, 320), false);
  const moved = (await db.query("select count(*)::int as n from public.notifications where type_key = 'sticker.moved' and recipient_entity_id = $1", [E.alice])).rows[0].n;
  assert.equal(moved, 1);
  const row = (await visible(db))[0];
  assert.deepEqual([row.pos_x, row.pos_y, row.size_percent], [300, 320, 100], "the position changes; the size does not");
});

test("visitors: only approved stickers on PUBLISHED Friends Stages of a public, enabled Wall, from senders whose GamID is public now", async () => {
  const db = await fixture();
  const a = await send(db, U.alice), b = await send(db, U.bob, { stage: "stage_3" });
  await review(db, a, true); await review(db, b, true);
  assert.equal((await visible(db)).length, 2);
  await db.query("update public.entities set visibility = 'PRIVATE' where entity_id = $1", [E.bob]);
  assert.deepEqual((await visible(db)).map(row => row.sender_handle), ["alice"], "a sender who went private is never named publicly");
  assert.deepEqual((await visible(db)).map(row => row.size_percent), [95], "the hidden sticker still counts in the Wall's order");
  await db.query("update public.wall_publications set document = $1 where entity_id = $2", [wall("my", "friends"), E.owner]);
  await db.query("update public.entities set visibility = 'PUBLIC' where entity_id = $1", [E.bob]);
  assert.deepEqual((await visible(db)).map(row => row.stage_id), ["stage_2"], "a stage that is not in the published Wall shows nothing");
  await db.query("update public.wall_publications set is_enabled = false where entity_id = $1", [E.owner]);
  assert.deepEqual(await visible(db), [], "a disabled Wall shows no stickers");
  await db.query("update public.wall_publications set is_enabled = true where entity_id = $1", [E.owner]);
  await db.query("update public.entities set visibility = 'PRIVATE' where entity_id = $1", [E.owner]);
  assert.deepEqual(await visible(db), [], "a private GamID shows no stickers");
  // nobody reads the table directly
  assert.match(await failure(as(db, U.alice, "select * from public.wall_sticker_placements")), /permission denied/);
  assert.match(await failure(as(db, null, "select * from public.wall_sticker_placements")), /permission denied/);
  assert.match(await failure(as(db, null, "select * from public.get_my_wall_stickers()")), /permission denied/);
});

test("search: public GamIDs with an enabled Wall that has a Friends Stage, never me; sent list shows my requests' outcome", async () => {
  const db = await fixture();
  const search = (q, user = U.alice) => as(db, user, "select * from public.search_sticker_recipients($1)", [q]).then(rows => rows.map(r => r.gamid_handle));
  assert.deepEqual(await search("wall"), ["wallowner"]);
  assert.deepEqual(await search("@WallOwner"), ["wallowner"]);
  assert.deepEqual(await search("Owner"), ["wallowner"], "display name match");
  assert.deepEqual(await search("alice", U.owner), [], "Alice's Wall has no Friends Stage");
  assert.deepEqual(await search("wall", U.owner), [], "never me");
  assert.deepEqual(await search("w"), [], "at least two characters");
  assert.deepEqual(await search("%"), [], "LIKE wildcards are plain text");
  const sender = (await as(db, U.priv, "select * from public.get_my_sticker_sender()"))[0];
  assert.deepEqual([sender.gamid_handle, sender.can_send], ["quiet", false]);
  const id = await send(db, U.alice);
  await review(db, id, false);
  const sent = await as(db, U.alice, "select * from public.get_my_sent_stickers()");
  assert.deepEqual(sent.map(r => [r.recipient_handle, r.status]), [["wallowner", "rejected"]]);
});

test("a Friends Stage with active stickers can be neither deleted nor turned into a My Stage (the save refuses STAGE_HAS_STICKERS); waiting ones do not block", async () => {
  const db = await fixture();
  const save = doc => as(db, U.owner, "select revision from public.save_my_wall_draft_impl_probe($1)", [doc]);
  await db.exec(`create function public.save_my_wall_draft_impl_probe(doc jsonb) returns table (revision bigint) language sql security definer set search_path = '' as $$
    select s.revision from private.save_my_wall_draft_impl(doc, (select d.revision from public.wall_drafts d join public.entity_memberships m on m.entity_id = d.entity_id where m.user_id = auth.uid())) s $$;
    grant execute on function public.save_my_wall_draft_impl_probe(jsonb), private.save_my_wall_draft_impl(jsonb, bigint) to authenticated;`);
  const pending = await send(db, U.alice, { stage: "stage_3" });
  assert.ok(await save(wall("my", "friends")), "stage 3 holds only a waiting request: it can be deleted");
  const approved = await send(db, U.alice);
  await review(db, approved, true);
  assert.equal(await failure(save(wall("my"))), "STAGE_HAS_STICKERS", "deleting stage 2 is refused");
  assert.equal(await failure(save(wall("my", "my"))), "STAGE_HAS_STICKERS", "turning stage 2 into a My Stage is refused");
  assert.ok(await save(wall("my", "friends", "my")), "every other change still saves");
  await as(db, U.owner, "select public.remove_wall_sticker($1)", [approved]);
  assert.ok(await save(wall("my", "my")), "once the stickers are gone, the stage can change");
  assert.ok(pending);
});
