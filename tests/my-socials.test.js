// My Socials (Profile Editor completion): the platform catalog is identical in the browser and the database, links are validated on both sides (https, the
// platform's own host and an account path - never javascript:, data:, http:, look-alike hosts or credentials), the public icons draw only valid saved links,
// there is no "Other", and the real migration (run in an isolated PGlite Postgres) enforces ownership, permissions, the PUBLIC gate and all-or-nothing saves.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { SOCIAL_PLATFORMS, SOCIAL_MAX, normalizeSocialUrl, validateSocialLinks, renderPublicSocials, socialPlatform } from "../dist/account/socials.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const migration = read("supabase/migrations/20261009120000_my_socials.sql");

const DANGEROUS = [
  "javascript:alert(1)", "JaVaScRiPt:alert(1)", "data:text/html,<script>alert(1)</script>", "vbscript:msgbox(1)",
  "https://instagram.com.evil.example/name", "https://evil.example/instagram.com/name", "https://user:pass@instagram.com/name",
  "https://instagram.com/name\"onmouseover=alert(1)", "https://instagram.com/<script>", "https://instagram.com/na me", "ftp://instagram.com/name",
];

test("the browser catalog is exactly the database catalog (keys, labels, patterns, order) and has no Other", () => {
  const rows = [...migration.matchAll(/\('([a-z_]+)', '([^']+)', '(\^[^']+\$)', (\d+)\)/g)].map(m => ({ key: m[1], label: m[2], pattern: m[3], order: Number(m[4]) }));
  assert.equal(rows.length, SOCIAL_PLATFORMS.length);
  assert.deepEqual(rows.map(r => [r.key, r.label, r.pattern]), SOCIAL_PLATFORMS.map(p => [p.key, p.label, p.pattern]));
  assert.deepEqual(rows.map(r => r.order), [...rows.map(r => r.order)].sort((a, b) => a - b), "same order");
  assert.equal(SOCIAL_MAX, 12);
  for (const key of ["instagram", "tiktok", "youtube", "twitch", "x", "snapchat", "discord", "kick", "facebook", "threads", "reddit", "linkedin"]) assert.ok(socialPlatform(key), key);
  assert.equal(socialPlatform("other"), null);
  assert.doesNotMatch(migration, /'other'/i);
  assert.match(read("dist/wall-editor/tools.js"), /"Other" link/, "the Wall keeps its own Other link");
});

test("normalization: what people paste becomes the canonical https account link; tracking parts are dropped", () => {
  assert.equal(normalizeSocialUrl("  instagram.com/espada.gg  "), "https://instagram.com/espada.gg");
  assert.equal(normalizeSocialUrl("http://www.twitch.tv/espada"), "https://www.twitch.tv/espada");
  assert.equal(normalizeSocialUrl("https://www.instagram.com/espada?igsh=abc#top"), "https://www.instagram.com/espada");
  assert.equal(normalizeSocialUrl("https://WWW.YouTube.com/@Espada"), "https://www.youtube.com/@Espada");
  assert.equal(normalizeSocialUrl("https://www.facebook.com/profile.php?id=123456789&ref=x"), "https://www.facebook.com/profile.php?id=123456789");
  assert.equal(normalizeSocialUrl("javascript:alert(1)"), "javascript:alert(1)", "anything that is not a web address is left as it is (and then refused)");
});

test("validation: one link per listed platform, its own host and an account path; every dangerous or foreign link is refused", () => {
  const ok = validateSocialLinks([
    { platform: "instagram", url: "instagram.com/espada.gg" }, { platform: "tiktok", url: "https://www.tiktok.com/@espada" }, { platform: "youtube", url: "https://youtube.com/@espada" },
    { platform: "twitch", url: "twitch.tv/espada_gg" }, { platform: "x", url: "https://twitter.com/espada" }, { platform: "discord", url: "https://discord.gg/abc123" },
    { platform: "snapchat", url: "https://www.snapchat.com/add/espada" }, { platform: "kick", url: "kick.com/espada" }, { platform: "facebook", url: "https://facebook.com/profile.php?id=123456" },
    { platform: "threads", url: "threads.net/@espada" }, { platform: "reddit", url: "reddit.com/user/espada" }, { platform: "linkedin", url: "linkedin.com/in/espada-gg" },
  ]);
  assert.equal(ok.ok, true);
  assert.equal(ok.links.length, 12);
  for (const url of DANGEROUS) assert.equal(validateSocialLinks([{ platform: "instagram", url }]).ok, false, url);
  assert.equal(validateSocialLinks([{ platform: "instagram", url: "https://www.tiktok.com/@espada" }]).code, "INVALID_SOCIAL_URL", "a link must belong to its platform");
  assert.equal(validateSocialLinks([{ platform: "other", url: "https://example.com" }]).code, "INVALID_SOCIAL_PLATFORM");
  assert.equal(validateSocialLinks([{ platform: "x", url: "x.com/a" }, { platform: "x", url: "x.com/b" }]).code, "DUPLICATE_SOCIAL_PLATFORM");
  assert.equal(validateSocialLinks([{ platform: "x", url: "  " }]).code, "EMPTY_SOCIAL_URL");
  assert.equal(validateSocialLinks(new Array(13).fill({ platform: "x", url: "x.com/a" })).code, "TOO_MANY_SOCIAL_LINKS");
});

// a tiny DOM for the public renderer
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attributes = {}; this.dataset = {}; this.className = ""; this.textContent = ""; this.hidden = false; }
  setAttribute(k, v) { this.attributes[k] = String(v); }
  append(...nodes) { this.children.push(...nodes); }
  replaceChildren(...nodes) { this.children = nodes; }
}
const doc = { createElement: tag => new Node(tag) };

test("public icons: only valid saved links are drawn, as labelled https links opening safely in a new tab; nothing for an empty list", () => {
  const box = new Node("div");
  const drawn = renderPublicSocials(box, [
    { platform_key: "instagram", label: "Instagram", url: "https://www.instagram.com/espada" },
    { platform_key: "twitch", label: "Twitch", url: "javascript:alert(1)" },          // could never come from the server; still never drawn
    { platform_key: "other", label: "Other", url: "https://example.com" },
    { platform_key: "youtube", label: "YouTube", url: "https://www.youtube.com/@espada" },
  ], doc);
  assert.equal(drawn, 2);
  assert.equal(box.hidden, false);
  assert.deepEqual(box.children.map(a => a.href), ["https://www.instagram.com/espada", "https://www.youtube.com/@espada"]);
  for (const a of box.children) { assert.equal(a.target, "_blank"); assert.equal(a.rel, "noopener noreferrer nofollow"); assert.match(a.attributes["aria-label"], /\(opens in a new tab\)$/); }
  const none = new Node("div");
  assert.equal(renderPublicSocials(none, [], doc), 0);
  assert.equal(none.hidden, true);
});

test("the public page reads socials through the anonymous reader and keeps the accepted renderer / layout untouched", () => {
  const publicJs = read("dist/public/public.js");
  assert.match(publicJs, /const socialLinks = await getPublicSocialLinks\(identity\.gamid_handle\)\.catch\(\(\) => \[\]\);/);
  assert.match(publicJs, /hasSections = prependPublicSocials\(sectionsPanel, socialLinks\) \|\| hasSections;/);
  assert.ok(publicJs.indexOf("export function prependPublicSocials") < publicJs.indexOf("const LEAGUE_APEX_TIERS"), "kept outside the renderer other tests evaluate in isolation");
  assert.doesNotMatch(read("dist/account/intro-preview.js"), /social/i, "the Intro / profile frame is not changed");
});

// ---- the real migration in an isolated Postgres ---------------------------------------------------------------------------------------------------------
const A = "11111111-1111-4111-8111-111111111111", B = "22222222-2222-4222-8222-222222222222", EA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa", EB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
async function fixture() {
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
  await db.exec(migration);
  const as = async uid => db.exec(uid ? `set role authenticated; set request.jwt.claim.sub = '${uid}';` : "set role anon; set request.jwt.claim.sub = '';");
  const admin = () => db.exec("reset role;");
  const set = async links => (await db.query("select * from public.set_my_social_links($1::jsonb)", [JSON.stringify(links)])).rows;
  const mine = async () => (await db.query("select * from public.get_my_social_links()")).rows;
  const publicOf = async handle => (await db.query("select * from public.get_public_social_links($1)", [handle])).rows;
  return { db, as, admin, set, mine, publicOf };
}
const code = error => error?.message ?? String(error);

test("migration: the owner saves, reorders, edits and removes their own links; the whole list is replaced atomically", async () => {
  const f = await fixture();
  await f.as(A);
  assert.deepEqual((await f.set([{ platform: "instagram", url: "https://www.instagram.com/espada" }, { platform: "twitch", url: "https://twitch.tv/espada" }])).map(r => [r.platform_key, r.sort_order]), [["instagram", 0], ["twitch", 1]]);
  assert.deepEqual((await f.set([{ platform: "twitch", url: "https://twitch.tv/espada_live" }, { platform: "instagram", url: "https://www.instagram.com/espada" }])).map(r => [r.platform_key, r.url]), [["twitch", "https://twitch.tv/espada_live"], ["instagram", "https://www.instagram.com/espada"]]);
  // a refused list changes nothing (all or nothing)
  await assert.rejects(f.set([{ platform: "x", url: "https://x.com/espada" }, { platform: "instagram", url: "javascript:alert(1)" }]), e => code(e) === "INVALID_SOCIAL_URL");
  assert.equal((await f.mine()).length, 2);
  assert.deepEqual(await f.set([]), []);
  assert.deepEqual(await f.mine(), []);
});

test("migration: every dangerous, foreign or malformed link is refused by the database itself", async () => {
  const f = await fixture();
  await f.as(A);
  for (const url of DANGEROUS) await assert.rejects(f.set([{ platform: "instagram", url }]), e => code(e) === "INVALID_SOCIAL_URL", url);
  await assert.rejects(f.set([{ platform: "instagram", url: `https://www.instagram.com/${"a".repeat(200)}` }]), e => code(e) === "INVALID_SOCIAL_URL");
  await assert.rejects(f.set([{ platform: "other", url: "https://example.com/me" }]), e => code(e) === "INVALID_SOCIAL_PLATFORM");
  await assert.rejects(f.set([{ platform: "x", url: "https://x.com/a" }, { platform: "x", url: "https://x.com/b" }]), e => code(e) === "DUPLICATE_SOCIAL_PLATFORM");
  await assert.rejects(f.set(new Array(13).fill({ platform: "x", url: "https://x.com/a" })), e => code(e) === "TOO_MANY_SOCIAL_LINKS");
  await assert.rejects(f.db.query("select * from public.set_my_social_links($1::jsonb)", [JSON.stringify({ platform: "x" })]), e => code(e) === "INVALID_SOCIAL_LINKS");
  await assert.rejects(f.set([{ platform: "x", url: 42 }]), e => code(e) === "INVALID_SOCIAL_LINKS");
});

test("migration: nobody reaches another GamID's links; the tables are closed; anonymous callers can only use the public reader", async () => {
  const f = await fixture();
  await f.as(A); await f.set([{ platform: "instagram", url: "https://www.instagram.com/espada" }]);
  await f.as(B); await f.set([{ platform: "x", url: "https://x.com/draftie" }]);
  assert.deepEqual((await f.mine()).map(r => r.platform_key), ["x"], "B sees only B's own links");
  await f.as(A);
  assert.deepEqual((await f.mine()).map(r => r.platform_key), ["instagram"], "B's save never touched A");
  for (const sql of ["select * from public.identity_social_links", `insert into public.identity_social_links values ('${EB}', 'x', 'https://x.com/hijack', 0, now())`, "delete from public.identity_social_links", "select * from public.social_platform_catalog"]) {
    await assert.rejects(f.db.query(sql), /permission denied/, sql);
  }
  await f.as(null);
  await assert.rejects(f.db.query("select * from public.get_my_social_links()"), /permission denied/);
  await assert.rejects(f.db.query("select * from public.set_my_social_links('[]'::jsonb)"), /permission denied/);
  await f.as("33333333-3333-4333-8333-333333333333");
  await assert.rejects(f.mine(), e => code(e) === "IDENTITY_NOT_FOUND", "a signed-in user without a GamID has nothing to read or write");
});

test("migration: the public reader returns a PUBLISHED GamID's saved links only (in order, with labels); a draft GamID returns none", async () => {
  const f = await fixture();
  await f.as(A); await f.set([{ platform: "youtube", url: "https://www.youtube.com/@espada" }, { platform: "instagram", url: "https://www.instagram.com/espada" }]);
  await f.as(B); await f.set([{ platform: "x", url: "https://x.com/draftie" }]);
  await f.as(null);
  assert.deepEqual((await f.publicOf(" Espada ")).map(r => [r.platform_key, r.label]), [["youtube", "YouTube"], ["instagram", "Instagram"]]);
  assert.deepEqual(await f.publicOf("draftie"), [], "not published: nothing is visible");
  assert.deepEqual(await f.publicOf("nobody"), []);
  await f.admin();
  await f.db.exec(`update public.entities set visibility = 'DRAFT' where entity_id = '${EA}'`);
  await f.as(null);
  assert.deepEqual(await f.publicOf("espada"), [], "unpublishing hides the links at once");
  await f.admin();
  await f.db.exec(`delete from public.entities where entity_id = '${EA}'`);
  assert.equal((await f.db.query(`select count(*)::int n from public.identity_social_links where entity_id = '${EA}'`)).rows[0].n, 0, "links go with their GamID");
});
