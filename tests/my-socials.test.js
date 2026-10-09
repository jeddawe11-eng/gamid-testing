// My Socials on the Wall's link engine: ONE source of platform / URL rules for the Wall and the Classic Profile. My Socials only chooses which Wall platforms and
// which ACCOUNT kinds it offers; detection, id rules and every rebuilt address come from the Wall adapters (browser) and private.wall_embed_specs (server).
// The real migrations run in an isolated PGlite Postgres: ownership, permissions, the PUBLIC gate and all-or-nothing saves; nothing touches TESTING.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SOCIAL_PLATFORMS, SOCIAL_MAX, normalizeSocialUrl, validateSocialLinks, parseSocialLink, renderPublicSocials, socialPlatform, socialUrl } from "../dist/account/socials.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload } from "../dist/wall-kit/embed/index.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const socialsSource = read("dist/account/socials.js");
const initial = read("supabase/migrations/20261009120000_my_socials.sql");
const wallDiscord = read("supabase/migrations/20261009150000_wall_discord_profile.sql");
const engine = read("supabase/migrations/20261009151000_my_socials_link_engine.sql");
const DISCORD_USER = "https://discord.com/users/374102653111762948";
const DANGEROUS = [
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)", "file:///etc/passwd",
  "https://instagram.com.evil.example/name", "https://evil.example/instagram.com/name", "https://user:pass@instagram.com/name",
  "https://instagram.com/name\"onmouseover=alert(1)", "https://instagram.com/<script>", "https://instagram.com/na me",
];

test("one engine: My Socials keeps no URL patterns of its own; every platform and account kind exists in the Wall adapters AND in the Wall's server rules", () => {
  assert.doesNotMatch(socialsSource, /pattern:|new RegExp\(platform\.pattern|url_pattern/, "no second rule catalog");
  assert.match(socialsSource, /import \{ PROVIDERS, detectEmbed, isAllowedOpenUrl \} from "\.\.\/wall-kit\/embed\/index\.js";/);
  const specs = new Set([...wallDiscord.matchAll(/\('([a-z]+)', '([a-z]+)', '([^']+)', (true|false)\)/g)].map(m => `${m[1]}/${m[2]}/${m[3]}`));
  for (const platform of SOCIAL_PLATFORMS) {
    const provider = PROVIDERS.get(platform.key);
    assert.ok(provider, platform.key);
    assert.equal(platform.label, provider.label, "the label is the Wall's");
    for (const kind of platform.kinds) assert.ok(specs.has(`${platform.key}/${kind}/${provider.kinds[kind].id}`), `${platform.key}/${kind} is in private.wall_embed_specs with the adapter's id rule`);
  }
  // the server's account-kind list is exactly the browser's
  const sql = Object.fromEntries([...engine.matchAll(/\('([a-z]+)', array\[([^\]]+)\]\)/g)].map(m => [m[1], m[2].split(",").map(s => s.trim().replace(/'/g, "")).sort()]));
  assert.deepEqual(sql, Object.fromEntries(SOCIAL_PLATFORMS.map(p => [p.key, [...p.kinds].sort()])));
  assert.equal(SOCIAL_MAX, 9);
  assert.equal(socialPlatform("other"), null, "no Other");
  for (const gone of ["threads", "reddit", "linkedin"]) assert.equal(socialPlatform(gone), null, `${gone} is not a Wall platform`);
  assert.match(engine, /delete from public\.social_platform_catalog where platform_key in \('threads', 'reddit', 'linkedin'\);/);
  assert.match(read("dist/wall-editor/tools.js"), /"Other" link/, "the Wall keeps its own Other link");
});

test("Discord personal profile, the same URL in both surfaces: the Wall offers it as a Link; My Socials accepts it as a Discord account; both open the same official address", () => {
  const wall = detectEmbed(DISCORD_USER);
  assert.equal(wall.ok, true);
  assert.deepEqual([wall.providerKey, wall.kind, wall.id, wall.presentations], ["discord", "profile", "374102653111762948", ["link"]]);
  assert.equal(wall.canonicalUrl, DISCORD_USER);
  const linkPayload = buildEmbedPayload(wall, { presentation: "link" });
  assert.deepEqual(linkPayload.errors, []);
  assert.deepEqual(linkPayload.payload, { providerKey: "discord", data: { kind: "profile", id: "374102653111762948", presentation: "link" } });
  for (const presentation of ["card", "embed"]) assert.deepEqual(buildEmbedPayload(wall, { presentation }).errors, ["INVALID_PRESENTATION"], `no ${presentation} for a Discord profile`);
  const social = parseSocialLink("discord", DISCORD_USER);
  assert.deepEqual(social, { ok: true, platform: "discord", kind: "profile", id: "374102653111762948", url: DISCORD_USER });
  assert.equal(socialUrl("discord", "profile", "374102653111762948"), DISCORD_USER);
  // invitations still work, on both surfaces
  for (const url of ["discord.gg/abc123", "https://discord.com/invite/abc123"]) {
    assert.deepEqual([detectEmbed(url).kind, detectEmbed(url).presentations, detectEmbed(url).canonicalUrl], ["invite", ["card", "link"], "https://discord.gg/abc123"], url);
    assert.equal(parseSocialLink("discord", url).kind, "invite");
  }
  for (const url of ["https://discord.com/users/abc", "https://discord.com/users/123", "https://discord.com/channels/1/2", "https://discord.gg/users/374102653111762948"]) assert.notEqual(detectEmbed(url).kind, "profile", url);
});

test("validation through the engine: account pages only, the chosen platform's own host, canonical addresses; dangerous, foreign and content links are refused", () => {
  const ok = validateSocialLinks([
    { platform: "instagram", url: "instagram.com/espada.gg?igsh=abc" }, { platform: "tiktok", url: "https://www.tiktok.com/@espada" }, { platform: "youtube", url: "https://youtube.com/@espada" },
    { platform: "twitch", url: "twitch.tv/espada_gg" }, { platform: "kick", url: "kick.com/espada" }, { platform: "x", url: "https://twitter.com/espada" },
    { platform: "snapchat", url: "https://www.snapchat.com/add/espada" }, { platform: "discord", url: DISCORD_USER }, { platform: "facebook", url: "https://facebook.com/espadagg" },
  ]);
  assert.equal(ok.ok, true);
  assert.deepEqual(ok.links.map(l => [l.platform, l.kind, l.id]), [["instagram", "profile", "espada.gg"], ["tiktok", "profile", "@espada"], ["youtube", "channel", "@espada"], ["twitch", "channel", "espada_gg"], ["kick", "channel", "espada"], ["x", "profile", "espada"], ["snapchat", "profile", "espada"], ["discord", "profile", "374102653111762948"], ["facebook", "page", "espadagg"]]);
  assert.equal(normalizeSocialUrl("instagram.com/espada.gg?igsh=abc", "instagram"), "https://www.instagram.com/espada.gg/");
  for (const url of DANGEROUS) assert.equal(validateSocialLinks([{ platform: "instagram", url }]).ok, false, url);
  assert.equal(parseSocialLink("instagram", "https://www.tiktok.com/@espada").code, "INVALID_SOCIAL_URL", "a link must belong to its platform");
  for (const [platform, url] of [["youtube", "https://www.youtube.com/watch?v=dQw4w9WgXcQ"], ["x", "https://x.com/espada/status/12345"], ["instagram", "https://www.instagram.com/p/ABCdef123/"], ["twitch", "https://www.twitch.tv/videos/123456"]]) assert.equal(parseSocialLink(platform, url).code, "NOT_A_SOCIAL_ACCOUNT", url);
  assert.equal(validateSocialLinks([{ platform: "other", url: "https://example.com" }]).code, "INVALID_SOCIAL_PLATFORM");
  assert.equal(validateSocialLinks([{ platform: "x", url: "x.com/a" }, { platform: "x", url: "x.com/b" }]).code, "DUPLICATE_SOCIAL_PLATFORM");
  assert.equal(validateSocialLinks([{ platform: "x", url: "  " }]).code, "EMPTY_SOCIAL_URL");
  assert.equal(validateSocialLinks(new Array(10).fill({ platform: "x", url: "x.com/a" })).code, "TOO_MANY_SOCIAL_LINKS");
});

class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.hidden = false; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
const doc = { createElement: tag => new Node(tag) };

test("public icons: addresses rebuilt by the Wall adapters from saved parts; anything the engine refuses is never drawn", () => {
  const box = new Node("div");
  const drawn = renderPublicSocials(box, [
    { platform_key: "discord", label: "Discord", kind: "profile", account_id: "374102653111762948" },
    { platform_key: "instagram", label: "Instagram", kind: "profile", account_id: "espada" },
    { platform_key: "twitch", label: "Twitch", kind: "channel", account_id: "javascript:alert(1)" },   // could never come from the server; still never drawn
    { platform_key: "youtube", label: "YouTube", kind: "video", account_id: "dQw4w9WgXcQ" },             // not an account kind
    { platform_key: "reddit", label: "Reddit", kind: "profile", account_id: "espada" },                 // not a platform any more
  ], doc);
  assert.equal(drawn, 2);
  assert.deepEqual(box.children.map(a => a.href), [DISCORD_USER, "https://www.instagram.com/espada/"]);
  assert.equal(box.children[0].children[0].dataset.platform, "discord", "the Discord icon");
  for (const a of box.children) { assert.equal(a.target, "_blank"); assert.equal(a.rel, "noopener noreferrer nofollow"); }
  const none = new Node("div");
  assert.equal(renderPublicSocials(none, [], doc), 0);
  assert.equal(none.hidden, true);
});

// ---- the real migrations in an isolated Postgres ---------------------------------------------------------------------------------------------------------
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function fixture({ links = [] } = {}) {

  const db = new PGlite();
  await db.exec(`create role anon; create role authenticated;
    create schema private; create schema auth;
    grant usage on schema public, private, auth to anon, authenticated;
    create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
    create function private.normalize_handle(text) returns text language sql immutable as $$ select lower(btrim($1)) $$;
    grant execute on function auth.uid(), private.normalize_handle(text) to anon, authenticated;
    create table public.entities (entity_id uuid primary key, entity_type text, gamid_handle text, visibility text);
    create table public.entity_memberships (entity_id uuid references public.entities(entity_id) on delete cascade, user_id uuid, role text);
    insert into public.entities values ('${EA}', 'SOLO', 'espada', 'PUBLIC'), ('${EB}', 'SOLO', 'draftie', 'DRAFT');
    insert into public.entity_memberships values ('${EA}', '${A}', 'OWNER'), ('${EB}', '${B}', 'OWNER');`);
  await db.exec(initial);
  // links saved under the FIRST My Socials version (url shape), before the engine migration
  for (const [entity, platform, url, order] of links) await db.query("insert into public.identity_social_links values ($1, $2, $3, $4, now())", [entity, platform, url, order]);
  await db.exec(wallDiscord);
  await db.exec(engine);
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const set = async items => (await db.query("select * from public.set_my_social_links($1::jsonb)", [JSON.stringify(items)])).rows;
  const mine = async () => (await db.query("select * from public.get_my_social_links()")).rows;
  const publicOf = async handle => (await db.query("select * from public.get_public_social_links($1)", [handle])).rows;
  return { db, as, admin, set, mine, publicOf };
}
const code = error => error?.message ?? String(error);
const L = (platform, kind, id) => ({ platform, kind, id });

test("migration: saved links are converted losslessly to the same account; a link the Wall engine cannot express stops the migration", async () => {
  const f = await fixture({ links: [[EA, "discord", DISCORD_USER, 0], [EA, "instagram", "https://www.instagram.com/espada", 1], [EB, "x", "https://twitter.com/draftie", 0]] });
  await f.as(A);
  assert.deepEqual((await f.mine()).map(r => [r.platform_key, r.kind, r.account_id, r.sort_order]), [["discord", "profile", "374102653111762948", 0], ["instagram", "profile", "espada", 1]]);
  await f.as(null);
  assert.deepEqual((await f.publicOf("espada")).map(r => socialUrl(r.platform_key, r.kind, r.account_id)), [DISCORD_USER, "https://www.instagram.com/espada/"], "the same addresses as before");
  await f.as(B);
  assert.deepEqual((await f.mine()).map(r => `${r.platform_key}/${r.kind}/${r.account_id}`), ["x/profile/draftie"]);
  await assert.rejects(fixture({ links: [[EA, "threads", "https://www.threads.net/@espada", 0]] }), e => /MY_SOCIALS_LINK_NOT_EXPRESSIBLE/.test(code(e)), "nothing is dropped silently");
});

test("migration: the Wall server rules gain the Discord profile kind (Walls with it validate); My Socials saves parts the Wall rules accept", async () => {
  const f = await fixture();
  const spec = (await f.db.query("select * from private.wall_embed_specs() where provider = 'discord' order by kind")).rows;
  assert.deepEqual(spec.map(s => [s.kind, s.id_pattern, s.inline]), [["invite", "^[A-Za-z0-9-]{2,32}$", false], ["profile", "^[0-9]{17,20}$", false]]);
  await f.as(A);
  assert.deepEqual((await f.set([L("discord", "profile", "374102653111762948"), L("twitch", "channel", "espada")])).map(r => [r.platform_key, r.kind, r.account_id, r.sort_order]), [["discord", "profile", "374102653111762948", 0], ["twitch", "channel", "espada", 1]]);
  await f.set([L("twitch", "channel", "espada_live"), L("discord", "invite", "abc123")]);
  assert.deepEqual((await f.mine()).map(r => `${r.platform_key}/${r.kind}/${r.account_id}`), ["twitch/channel/espada_live", "discord/invite/abc123"]);
  // a refused list changes nothing
  await assert.rejects(f.set([L("x", "profile", "ok"), L("instagram", "profile", "javascript:alert(1)")]), e => code(e) === "INVALID_SOCIAL_URL");
  assert.equal((await f.mine()).length, 2);
  assert.deepEqual(await f.set([]), []);
});

test("migration: content kinds, foreign kinds, bad ids, Other and removed platforms are refused by the database itself", async () => {
  const f = await fixture();
  await f.as(A);
  await assert.rejects(f.set([L("youtube", "video", "dQw4w9WgXcQ")]), e => code(e) === "NOT_A_SOCIAL_ACCOUNT", "a video is not an account");
  await assert.rejects(f.set([L("discord", "channel", "1")]), e => code(e) === "NOT_A_SOCIAL_ACCOUNT");
  for (const id of ["javascript:alert(1)", "abc", "1234", "<script>", "374102653111762948'; drop table x;--"]) await assert.rejects(f.set([L("discord", "profile", id)]), e => code(e) === "INVALID_SOCIAL_URL", id);
  for (const platform of ["other", "threads", "reddit", "linkedin"]) await assert.rejects(f.set([L(platform, "profile", "espada")]), e => code(e) === "INVALID_SOCIAL_PLATFORM", platform);
  await assert.rejects(f.set([L("x", "profile", "a"), L("x", "profile", "b")]), e => code(e) === "DUPLICATE_SOCIAL_PLATFORM");
  await assert.rejects(f.set(new Array(10).fill(L("x", "profile", "a"))), e => code(e) === "TOO_MANY_SOCIAL_LINKS");
  await assert.rejects(f.db.query("select * from public.set_my_social_links($1::jsonb)", [JSON.stringify([{ platform: "x", url: "https://x.com/a" }])]), e => code(e) === "INVALID_SOCIAL_LINKS", "the old URL shape is not accepted");
});

test("migration: nobody reaches another GamID's links; the tables stay closed; anonymous callers only have the public reader, gated on PUBLIC", async () => {
  const f = await fixture();
  await f.as(A); await f.set([L("discord", "profile", "374102653111762948"), L("instagram", "profile", "espada")]);
  await f.as(B); await f.set([L("x", "profile", "draftie")]);
  assert.deepEqual((await f.mine()).map(r => r.platform_key), ["x"]);
  await f.as(A);
  assert.deepEqual((await f.mine()).map(r => r.platform_key), ["discord", "instagram"]);
  for (const sql of ["select * from public.identity_social_links", "select * from public.social_platform_catalog", "select * from private.wall_embed_specs()"]) await assert.rejects(f.db.query(sql), /permission denied/, sql);
  await f.as(null);
  await assert.rejects(f.db.query("select * from public.set_my_social_links('[]'::jsonb)"), /permission denied/);
  assert.deepEqual((await f.publicOf("espada")).map(r => [r.platform_key, r.label, r.kind, r.account_id]), [["discord", "Discord", "profile", "374102653111762948"], ["instagram", "Instagram", "profile", "espada"]]);
  assert.deepEqual(await f.publicOf("draftie"), [], "not published: nothing is visible");
  await f.admin(); await f.db.exec(`delete from public.entities where entity_id = '${EA}'`);
  assert.equal((await f.db.query(`select count(*)::int n from public.identity_social_links where entity_id = '${EA}'`)).rows[0].n, 0, "links go with their GamID");
});
