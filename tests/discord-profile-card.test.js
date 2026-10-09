// Discord Profile Card: the real Gaming Connections migration + the card migration in an isolated PGlite Postgres (only older, unrelated objects are stubbed:
// auth, the GamID entity tables, My Socials' post-link-engine tables). The card is returned only when every server-side condition holds; existing connections
// start OFF; consent is recorded and withdrawn with the switch; Disconnect removes it; nobody else can change it; anonymous callers get only approved fields.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const foundation = read("supabase/migrations/20260919130000_gaming_connections_foundation.sql");
const card = read("supabase/migrations/20261009190000_discord_profile_card.sql");
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const ID = "374102653111762948", OTHER = "374102653111762949";
const AVATAR = `https://cdn.discordapp.com/avatars/${ID}/${"a".repeat(32)}.png?size=128`;

async function fixture({ withCard = true } = {}) {
  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated; create role service_role;
    create schema private; create schema auth; create schema extensions;
    grant usage on schema public, private, auth to anon, authenticated;
    create table auth.users (id uuid primary key, email_confirmed_at timestamptz);
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function extensions.gen_random_bytes(int) returns bytea language sql as $$ select decode(md5(random()::text) || md5(random()::text), 'hex') $$;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    grant execute on function auth.uid(), private.normalize_handle(text) to anon, authenticated;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid, user_id uuid, role text);
    insert into auth.users values ('${A}', now()), ('${B}', now());
    insert into public.entities values ('${EA}', 'SOLO', 'espada', 'PUBLIC'), ('${EB}', 'SOLO', 'other', 'PUBLIC');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');
    create table public.social_platform_catalog (platform_key text primary key, active boolean not null default true);
    insert into public.social_platform_catalog values ('discord', true), ('instagram', true);
    create table public.identity_social_links (entity_id uuid, platform_key text, kind text, account_id text, sort_order smallint, primary key (entity_id, platform_key));
    alter table public.social_platform_catalog enable row level security; alter table public.identity_social_links enable row level security;
    revoke all on table public.social_platform_catalog, public.identity_social_links from public, anon, authenticated;
    create function private.my_socials_entity_id() returns uuid language plpgsql stable security definer set search_path = '' as $$
      declare owned uuid; begin
        if (select auth.uid()) is null then raise exception using errcode = '42501', message = 'AUTH_REQUIRED'; end if;
        select e.entity_id into owned from public.entity_memberships m join public.entities e on e.entity_id = m.entity_id where m.user_id = (select auth.uid()) and m.role = 'OWNER' and e.entity_type = 'SOLO' limit 1;
        if owned is null then raise exception using errcode = 'P0002', message = 'IDENTITY_NOT_FOUND'; end if; return owned; end $$;
    revoke all on function private.my_socials_entity_id() from public, anon; grant execute on function private.my_socials_entity_id() to authenticated;`);
  await db.exec(foundation);
  // the owner's existing connection (made before this feature) and My Socials link of the same account
  await db.exec(`insert into public.gaming_connections (entity_id, provider_key, provider_account_id, provider_username, provider_display_name, provider_avatar_url, is_public)
      values ('${EA}', 'discord', '${ID}', 'espada', 'Espada', '${AVATAR}', true);
    insert into public.identity_social_links values ('${EA}', 'discord', 'profile', '${ID}', 0);`);
  if (withCard) await db.exec(card);
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const publicCard = async (handle = "espada") => { await as(null); const rows = (await db.query("select * from public.get_public_discord_card($1)", [handle])).rows; await admin(); return rows; };
  const setCard = async (uid, on) => { await as(uid); try { return (await db.query("select * from public.set_my_discord_profile_card($1)", [on])).rows[0]; } finally { await admin(); } };
  const mine = async uid => { await as(uid); try { return (await db.query("select * from public.get_my_discord_profile_card()")).rows[0]; } finally { await admin(); } };
  return { db, as, admin, publicCard, setCard, mine };
}

test("migration: additive - existing connections start OFF with no consent, and nothing else in the row changes", async () => {
  const f = await fixture({ withCard: false });
  const before = (await f.db.query("select * from public.gaming_connections")).rows;
  await f.db.exec(card);
  const after = (await f.db.query("select * from public.gaming_connections")).rows;
  assert.deepEqual(after.map(({ show_profile_card, profile_card_consented_at, ...rest }) => rest), before);
  assert.deepEqual(after.map(r => [r.show_profile_card, r.profile_card_consented_at]), [[false, null]]);
  assert.deepEqual(await f.publicCard(), [], "OFF by default: no card");
  assert.doesNotMatch(card.replace(/--.*$/gm, ""), /\bdrop\b|\bdelete\b|\btruncate\b|get_public_identity|disconnect_my_connection|complete_connection_attempt|play_together|grant[^;]*\bon table\b/i, "no data removed; the identity reader, OAuth, Disconnect and Team Voice untouched; no table grant");
});

test("owner opt-in / opt-out: consent recorded and withdrawn, persisted, duplicate clicks keep the first consent", async () => {
  const f = await fixture();
  assert.deepEqual(await f.mine(A), { connected: true, show_profile_card: false, consented_at: null, show_on_gamid: true, my_socials_matches: true, gamid_public: true });
  const on = await f.setCard(A, true);
  assert.equal(on.show_profile_card, true);
  assert.ok(on.consented_at instanceof Date, "explicit consent recorded with its time");
  const again = await f.setCard(A, true);
  assert.equal(again.consented_at.getTime(), on.consented_at.getTime(), "a duplicate request changes nothing");
  assert.deepEqual((await f.mine(A)).show_profile_card, true, "persisted (read back after reload)");
  const card1 = await f.publicCard();
  assert.deepEqual(card1, [{ discord_id: ID, username: "espada", display_name: "Espada", avatar: AVATAR }], "exactly the approved fields");
  const off = await f.setCard(A, false);
  assert.deepEqual([off.show_profile_card, off.consented_at], [false, null], "opt-out withdraws the consent");
  assert.deepEqual(await f.publicCard(), []);
  await f.as(A);
  await assert.rejects(f.db.query("select * from public.set_my_discord_profile_card(null)"), /INVALID_PROFILE_CARD_SETTING/);
  await f.admin();
});

test("every server-side condition is required: PUBLIC GamID, Show on my GamID, consent, and the same Discord account in My Socials", async () => {
  const f = await fixture();
  await f.setCard(A, true);
  assert.equal((await f.publicCard()).length, 1);
  const without = async (change, undo, label) => { await f.db.exec(change); assert.deepEqual(await f.publicCard(), [], label); await f.db.exec(undo); assert.equal((await f.publicCard()).length, 1); };
  await without(`update public.entities set visibility = 'DRAFT' where entity_id = '${EA}'`, `update public.entities set visibility = 'PUBLIC' where entity_id = '${EA}'`, "PRIVATE GamID: no card");
  await without(`update public.gaming_connections set is_public = false`, `update public.gaming_connections set is_public = true`, "Show on my GamID off: no card");
  await without(`update public.identity_social_links set account_id = '${OTHER}' where entity_id = '${EA}'`, `update public.identity_social_links set account_id = '${ID}' where entity_id = '${EA}'`, "another Discord account in My Socials: no card");
  await without(`update public.identity_social_links set kind = 'invite', account_id = 'gamid' where entity_id = '${EA}'`, `update public.identity_social_links set kind = 'profile', account_id = '${ID}' where entity_id = '${EA}'`, "a server invite is not the account: no card");
  await without(`delete from public.identity_social_links where entity_id = '${EA}'`, `insert into public.identity_social_links values ('${EA}', 'discord', 'profile', '${ID}', 0)`, "no My Socials Discord link: no card");
  await without(`update public.social_platform_catalog set active = false where platform_key = 'discord'`, `update public.social_platform_catalog set active = true where platform_key = 'discord'`, "Discord not offered in My Socials: no card");
  // a username alone never proves anything: another GamID with the same username and a pasted link of A's account gets no card
  await f.db.exec(`insert into public.identity_social_links values ('${EB}', 'discord', 'profile', '${ID}', 0)`);
  assert.deepEqual(await f.publicCard("other"), [], "B pasted A's Discord link: B has no connection, so no card");
  assert.equal((await f.mine(B)).connected, false);
  assert.equal((await f.mine(B)).my_socials_matches, false);
});

test("malformed stored data never reaches visitors: an unexpected avatar address is dropped, a non-profile id gives no card", async () => {
  const f = await fixture();
  await f.setCard(A, true);
  for (const address of ["https://evil.example/a.png", `https://cdn.discordapp.com/avatars/${OTHER}/${"a".repeat(32)}.png?size=128`, `https://cdn.discordapp.com/avatars/${ID}/x.png?size=128`]) {
    await f.db.query("update public.gaming_connections set provider_avatar_url = $1", [address]);
    assert.equal((await f.publicCard())[0].avatar, null, address);
  }
  await f.db.exec(`update public.gaming_connections set provider_avatar_url = null`);
  assert.equal((await f.publicCard())[0].avatar, null, "no avatar: the page shows its fallback");
  await f.db.exec(`update public.gaming_connections set provider_account_id = '12345', provider_avatar_url = null; update public.identity_social_links set account_id = '12345'`);
  assert.deepEqual(await f.publicCard(), [], "only a Discord personal-profile id (17-20 digits)");
});

test("Disconnect removes the card and its consent at once; a new connection starts OFF; an unconnected owner cannot opt in", async () => {
  const f = await fixture();
  await f.setCard(A, true);
  await f.as(A); await f.db.query("select public.disconnect_my_connection('discord')"); await f.admin();
  assert.deepEqual(await f.publicCard(), []);
  assert.deepEqual(await f.mine(A), { connected: false, show_profile_card: false, consented_at: null, show_on_gamid: false, my_socials_matches: false, gamid_public: true });
  await assert.rejects(f.setCard(A, true), /DISCORD_NOT_CONNECTED/, "disabled while Discord is not connected");
  await f.db.exec(`insert into public.gaming_connections (entity_id, provider_key, provider_account_id, provider_username, is_public) values ('${EA}', 'discord', '${ID}', 'espada', true)`);
  assert.equal((await f.mine(A)).show_profile_card, false, "reconnecting never inherits an old ON");
  assert.deepEqual(await f.publicCard(), []);
  await assert.rejects(f.db.query(`update public.gaming_connections set show_profile_card = true, profile_card_consented_at = null`), /gaming_connections_profile_card_consent/, "ON always carries its consent time");
  await assert.rejects(f.db.query(`insert into public.gaming_connections (entity_id, provider_key, provider_account_id, show_profile_card, profile_card_consented_at) values ('${EB}', 'steam', '1', true, now())`), /violates/, "the card is Discord-only");
});

test("owner-only writes; anonymous callers can only read the approved card; the tables stay closed", async () => {
  const f = await fixture();
  await f.setCard(A, true);
  await assert.rejects(f.setCard(B, false), /DISCORD_NOT_CONNECTED/, "B acts only on B's own (absent) connection");
  assert.equal((await f.publicCard()).length, 1, "A's card is untouched by B");
  assert.match(card, /create function public\.set_my_discord_profile_card\(candidate_enabled boolean\)/, "the only argument is the choice - never an owner or GamID id");
  await f.as(B);
  await assert.rejects(f.db.query("update public.gaming_connections set show_profile_card = false"), /permission denied/);
  await f.as(null);
  await assert.rejects(f.db.query("select * from public.set_my_discord_profile_card(false)"), /permission denied/);
  await assert.rejects(f.db.query("select * from public.get_my_discord_profile_card()"), /permission denied/);
  await assert.rejects(f.db.query("select * from public.gaming_connections"), /permission denied/);
  const columns = (await f.db.query("select * from public.get_public_discord_card('espada')")).fields.map(field => field.name);
  assert.deepEqual(columns, ["discord_id", "username", "display_name", "avatar"], "no token, connection id, entity, timestamps, consent or trust internals");
  await f.admin();
});

test("Profile Editor: a separate opt-in in the Discord connection card, OFF unless the server says ON, saved only when the server confirms it", () => {
  const js = read("dist/account/account.js"), client = read("dist/account/supabase-client.js");
  assert.match(js, /label: "Show Discord Profile Card", settingKey: "discord_profile_card", section: "connections"/);
  assert.ok(js.includes("Share your Discord display name, username and avatar with visitors."));
  assert.match(js, /const saved = Boolean\(row\.connected && discordCard\?\.connected && discordCard\.show_profile_card\);/, "the switch shows the server's saved state only");
  assert.match(js, /if \(!result \|\| result\.show_profile_card !== next\) throw/, "no success without the server's confirmation");
  assert.match(js, /if \(!row\.connected\) \{\s*stagedVisibility\.delete\("discord_profile_card"\);\s*toggle\.disabled = true;/, "disabled while Discord is not connected");
  assert.match(js, /onChange: next => changeSectionVisibility\(row\.provider_key, next, showConnectionsMessage, loadConnections\)/, "Show on my GamID is unchanged");
  assert.match(client, /rpc\("set_my_discord_profile_card", \{ candidate_enabled: enabled \}\)/);
  assert.match(client, /rpc\("get_public_discord_card", \{ candidate_handle: handle \}, \{ anonymous: true \}\)/);
});

test("visitor page: the card attaches only to the Discord profile link of the card's own account, opens on click, and otherwise the ordinary link stays", async () => {
  const { discordProfileUrl, discordAvatar } = await import("../dist/public/discord-card.js");
  assert.equal(discordProfileUrl(ID), `https://discord.com/users/${ID}`);
  for (const bad of ["123", "javascript:alert(1)", `${ID}/x`, 374102653111762948, null]) assert.equal(discordProfileUrl(bad), null, String(bad));
  assert.equal(discordAvatar(ID, AVATAR), AVATAR);
  for (const bad of ["https://evil.example/a.png", AVATAR.replace(ID, OTHER), `${AVATAR}&x=1`, null]) assert.equal(discordAvatar(ID, bad), null, String(bad));
  const js = read("dist/public/discord-card.js"), page = read("dist/public/public.js");
  assert.match(js, /if \(!url \|\| !username \|\| anchor\.getAttribute\("href"\) !== url\) return false;/, "a card of another account never attaches");
  assert.match(js, /event\.preventDefault\(\);\s*if \(!dialog\.open\) dialog\.showModal\(\);/, "opens on click only, as a modal dialog");
  assert.match(js, /if \(event\.button !== 0 \|\| event\.metaKey \|\| event\.ctrlKey \|\| event\.shiftKey \|\| event\.altKey\) return;/, "new-tab clicks keep the ordinary link");
  assert.ok(js.includes("Discord may ask you to sign in."), "never claims Discord shows the profile without signing in");
  assert.doesNotMatch(js, /innerHTML|insertAdjacentHTML/);
  assert.match(page, /if \(discordLink\) getPublicDiscordCard\(identity\.gamid_handle\)\.then\(card => \{ if \(card\) attachDiscordCard\(discordLink, card, document\); \}, \(\) => \{\}\);/, "a failed read leaves the link");
});