// Friends Stickers V1 (2026-10-24): the migration's rules, run in an isolated PGlite Postgres with minimal stand-ins for the accepted tables and functions it uses
// (entities, memberships, Wall drafts / publications, notifications). The clip-link rule is checked against the browser's parseStickerClip on one corpus.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { stickerSizePercent } from "../dist/wall/stickers.js";
import { parseStickerClip } from "../dist/wall-kit/embed/providers/clip-links.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const migration = read("supabase/migrations/20261024100000_friends_stickers_v1.sql") + "\n" + read("supabase/migrations/20261025100000_friends_stickers_corrections.sql");
const U = { owner: "11111111-1111-4111-8111-111111111111", alice: "22222222-2222-4222-8222-222222222222", bob: "33333333-3333-4333-8333-333333333333", ghost: "44444444-4444-4444-8444-444444444444", priv: "55555555-5555-4555-8555-555555555555" };
const E = { owner: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", alice: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", bob: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", priv: "dddddddd-dddd-4ddd-8ddd-dddddddddddd" };
const wall = (...types) => ({ schemaVersion: 1, canvas: { width: 1000, height: 1778 }, stages: types.map((type, i) => ({ id: `stage_${i + 1}`, ...(type === "friends" ? { type } : {}), elements: [] })) });

async function fixture() {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role; create schema private; create schema auth; create schema storage; create table storage.objects (bucket_id text, name text); alter table storage.objects enable row level security; grant usage on schema storage to anon, authenticated; grant select on storage.objects to anon, authenticated;
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
  // Discord (follow-up 2026-10-25): server message permalinks yes; DMs, short ids, other paths, file links no
  "https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678", "https://www.discord.com/channels/123456789012345678/223456789012345678/323456789012345678/",
  "https://ptb.discord.com/channels/123456789012345678/223456789012345678/323456789012345678?a=1", "https://canary.discord.com/channels/123456789012345678/223456789012345678/323456789012345678#x",
  "https://discordapp.com/channels/123456789012345678/223456789012345678/323456789012345678", "https://discord.com/channels/@me/223456789012345678/323456789012345678",
  "https://discord.com/channels/123/456/789", "https://discord.com/channels/123456789012345678/223456789012345678", "https://discord.com/invite/abcdef", "https://discord.gg/abcdef",
  "https://media.discordapp.net/attachments/1/2/c.mp4", "https://evil.discord.com/channels/123456789012345678/223456789012345678/323456789012345678",
  "https://discord.com.evil.example/channels/123456789012345678/223456789012345678/323456789012345678",
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
  assert.equal(parseStickerClip("https://cdn.discordapp.com/attachments/1/2/clip.mp4?ex=abc").code, "STICKER_CLIP_DISCORD_FILE", "Discord file links expire: refused with their own code");
  assert.deepEqual(parseStickerClip("https://canary.discord.com/channels/123456789012345678/223456789012345678/323456789012345678?x=1").clip, { provider: "discord", url: "https://discord.com/channels/123456789012345678/223456789012345678/323456789012345678" }, "a message permalink, rebuilt to discord.com");
  assert.equal(parseStickerClip("https://discord.com/channels/@me/223456789012345678/323456789012345678").ok, false, "direct-message links are not accepted");
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

// four more public Walls with a Friends Stage (recipients r1..r4, each its own owner)
async function addRecipients(db) {
  const owners = [];
  for (let i = 1; i <= 4; i++) {
    const user = `0000000${i}-0000-4000-8000-00000000000${i}`, entity = `e000000${i}-0000-4000-8000-00000000000${i}`;
    await db.query("insert into public.entities values ($1, 'SOLO', $2, $3, null, 'PUBLIC')", [entity, `r${i}owner`, `R${i}`]);
    await db.query("insert into public.entity_memberships values ($1, $2, 'OWNER')", [entity, user]);
    await db.query("insert into public.wall_drafts (entity_id, document) values ($1, $2)", [entity, wall("my", "friends")]);
    await db.query("insert into public.wall_publications (entity_id, document) values ($1, $2)", [entity, wall("my", "friends")]);
    owners.push({ user, entity, handle: `r${i}owner` });
  }
  return owners;
}
const quota = (db, user) => as(db, user, "select * from public.get_my_sticker_quota()").then(rows => rows[0]);

test("quota: 5 counted submissions per sender in any rolling 24 hours, across ALL recipients; a rejection gives its slot back at once, an approval (even removed or deleted later) does not", async () => {
  const db = await fixture();
  const others = await addRecipients(db);
  const recipients = [{ user: U.owner, handle: "wallowner" }, ...others];
  const ids = [];
  for (const r of recipients) ids.push(await send(db, U.alice, { handle: r.handle }));
  assert.deepEqual({ ...(await quota(db, U.alice)), next_available_at: undefined }, { quota_limit: 5, used: 5, next_available_at: undefined }, "five sends to five different Walls use the whole quota");
  assert.equal(await failure(send(db, U.alice, { handle: "r1owner" })), "STICKER_DAILY_LIMIT", "a sixth is refused, whatever the recipient");
  assert.ok(await send(db, U.bob), "another sender has their own quota");
  // rejected: the slot comes back immediately
  await review(db, ids[1], false, others[0].user);
  assert.equal((await quota(db, U.alice)).used, 4);
  const sixth = await send(db, U.alice, { handle: "r1owner" });
  assert.equal(await failure(send(db, U.alice, { handle: "r2owner" })), "STICKER_DAILY_LIMIT");
  // approved and later removed: still counted
  await review(db, ids[0], true);
  await as(db, U.owner, "select public.remove_wall_sticker($1)", [ids[0]]);
  assert.equal((await quota(db, U.alice)).used, 5, "an approved-then-removed sticker keeps its slot");
  // approved and later deleted with its Wall's owner (the placement row is gone): still counted
  await review(db, ids[2], true, others[1].user);
  await db.query("delete from public.entities where entity_id = $1", [others[1].entity]);
  assert.equal((await db.query("select count(*)::int n from public.wall_sticker_placements where placement_id = $1", [ids[2]])).rows[0].n, 0);
  assert.equal((await quota(db, U.alice)).used, 5, "a deleted sticker keeps its slot until its 24 hours are over");
  assert.equal(await failure(send(db, U.alice, { handle: "r3owner" })), "STICKER_DAILY_LIMIT");
  // rolling window: each slot frees exactly 24 hours after its own send; next_available_at is the oldest counted send + 24 h
  await db.query("update public.wall_sticker_quota set created_at = now() - interval '23 hours' where placement_id = $1", [ids[0]]);
  const state = await quota(db, U.alice);
  assert.ok(Math.abs(new Date(state.next_available_at) - (Date.now() + 3600e3)) < 60e3, "the next slot frees when the oldest counted send turns 24 hours old");
  await db.query("update public.wall_sticker_quota set created_at = now() - interval '24 hours 1 minute' where placement_id = $1", [ids[0]]);
  assert.equal((await quota(db, U.alice)).used, 4);
  assert.ok(await send(db, U.alice, { handle: "r3owner" }), "after 24 hours the slot is free again");
  assert.ok(sixth);
  // the ledger is server-only
  assert.match(await failure(as(db, U.alice, "select * from public.wall_sticker_quota")), /permission denied/);
  assert.match(await failure(as(db, null, "select * from public.get_my_sticker_quota()")), /permission denied/);
});

test("quota: concurrent sends are serialized per sender - the quota is read and taken under the same transaction lock, so it can never be exceeded", async () => {
  const code = migration.slice(migration.lastIndexOf("create or replace function private.send_wall_sticker_impl"));
  const lock = code.indexOf("pg_advisory_xact_lock(hashtextextended('wall-sticker-sender:'"), read = code.indexOf("private.wall_sticker_quota_state(sender)"), insert = code.indexOf("insert into public.wall_sticker_quota");
  assert.ok(lock > 0 && lock < read && read < insert, "lock, then count, then take the slot - in one transaction");
  assert.doesNotMatch(code.slice(0, code.indexOf("$$;")), /STICKER_PENDING_LIMIT|STICKER_RATE_LIMIT/, "the V1 per-Wall and hourly limits are gone (the approved quota replaces them)");
  // sequential stand-in for a burst: ten back-to-back sends, exactly five succeed
  const db = await fixture();
  const others = await addRecipients(db);
  const handles = ["wallowner", ...others.map(o => o.handle)];
  const results = [];
  for (let i = 0; i < 10; i++) results.push(await failure(send(db, U.bob, { handle: handles[i % handles.length] })));
  assert.equal(results.filter(r => r === null).length, 5);
  assert.equal(results.filter(r => r === "STICKER_DAILY_LIMIT").length, 5);
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
  const fresh = () => db.query("update public.wall_sticker_quota set created_at = now() - interval '25 hours'");   // the quota is tested on its own
  for (let i = 0; i < 5; i++) { await fresh(); const id = await send(db, i % 2 ? U.bob : U.alice); await review(db, id, true); ids.push(id); }
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
  await fresh(); await send(db, U.alice);
  assert.deepEqual(Object.values(await sizes()), [95, 100]);
  // the 50% floor
  for (let i = 0; i < 12; i++) { await fresh(); const id = await send(db, i % 2 ? U.bob : U.alice); await review(db, id, true); }
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

test("visitors: only approved stickers on PUBLISHED Friends Stages of a public, enabled Wall; a sender who later goes PRIVATE keeps their sticker, avatar and name (Mazen 2026-10-25)", async () => {
  const db = await fixture();
  const a = await send(db, U.alice), b = await send(db, U.bob, { stage: "stage_3" });
  await review(db, a, true); await review(db, b, true);
  assert.equal((await visible(db)).length, 2);
  await db.query("update public.entities set visibility = 'PRIVATE' where entity_id = $1", [E.bob]);
  const after = await visible(db);
  assert.deepEqual(after.map(row => [row.sender_handle, row.sender_avatar_media_reference]), [["alice", `${U.alice}/avatar-1.jpg`], ["bob", null]], "a sender who went private keeps their approved sticker, avatar and name");
  assert.deepEqual(after.map(row => row.size_percent), [95, 100]);
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

test("private GamIDs: their notice tells only who it is (handle, name, avatar) and only for PRIVATE; their current avatar becomes readable, DRAFT avatars do not", async () => {
  const db = await fixture();
  const notice = handle => as(db, null, "select * from public.get_private_identity_notice($1)", [handle]);
  assert.deepEqual((await notice("quiet")).map(r => ({ ...r })), [{ gamid_handle: "quiet", display_name: "Quiet", avatar_media_reference: null }]);
  assert.deepEqual(await notice("alice"), [], "a PUBLIC GamID has its normal profile, no notice");
  assert.deepEqual(await notice("nobody"), [], "unknown: the same nothing as before");
  await db.query("update public.entities set visibility = 'DRAFT' where entity_id = $1", [E.priv]);
  assert.deepEqual(await notice("quiet"), [], "an unpublished (DRAFT) GamID stays indistinguishable from an unknown one");
  // the avatar rule: PRIVATE yes, DRAFT / PUBLIC-replaced no
  await db.query("update public.entities set visibility = 'PRIVATE', avatar_media_reference = $2 where entity_id = $1", [E.priv, `${U.priv}/avatar.jpg`]);
  const readable = path => db.query("select private.avatar_is_private_identity($1) as ok", [path]).then(r => r.rows[0].ok);
  assert.equal(await readable(`${U.priv}/avatar.jpg`), true);
  assert.equal(await readable(`${U.priv}/old-avatar.jpg`), false, "only the CURRENT avatar");
  await db.query("update public.entities set visibility = 'DRAFT' where entity_id = $1", [E.priv]);
  assert.equal(await readable(`${U.priv}/avatar.jpg`), false, "DRAFT avatars stay owner-only");
  assert.match(migration, /create policy "private identity avatars are readable"\non storage\.objects for select to anon, authenticated\nusing \(bucket_id = 'avatars' and private\.avatar_is_private_identity\(name\)\);/);
  assert.doesNotMatch(migration, /drop policy "public identity avatars are readable"|function private\.avatar_is_public/, "the accepted public-avatar rule is untouched");
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
