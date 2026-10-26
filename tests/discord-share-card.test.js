// GamID Discord share card (Components V2): the card cf-worker/worker.mjs puts in the /@<handle> page head for Discord, and the social-card avatar tile it
// uses as its thumbnail. The REAL modules are imported; the network is always mocked. Live behaviour (the real @black card in Discord) is checked separately.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import worker from "../cf-worker/worker.mjs";
import {
  COMPONENT_EMBED_MAX_BYTES, DIVIDER_IMAGE_PATH, buildDiscordCard, componentEmbedScript, embedJson, escapeMarkdown, fetchPublicExtras, locationLine, roleLine,
  roleSummary,
} from "../cf-worker/discord-card.mjs";
import { AVATAR_TILE_SIZE, avatarLetter, buildAvatarTileElement, isAvatarVariant } from "../supabase/functions/_shared/social-avatar.js";

const read = path => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const SUPABASE = "https://upvtrczefcvigxdyuylw.supabase.co";
const ORIGIN = "https://gamid-testing-static.gamid.workers.dev";
const CATALOG = [
  { key: "content_creator", label: "Content Creator" }, { key: "player", label: "Player" }, { key: "streamer", label: "Streamer" },
  { key: "coach", label: "Coach" }, { key: "caster", label: "Caster" },
];
const IDENTITY = {
  gamid_handle: "black", display_name: "Espada", bio: "Gamer who loves competitive games.", role_catalog: CATALOG, primary_role_key: "content_creator",
  role_keys: ["player", "content_creator", "streamer", "coach", "caster"], avatar_media_reference: "07991366-84e9/avatar-1.jpg",
  intro_derivative_path: "07991366-84e9/intro-d3.webm",
};
const EXTRAS = { member_since_year: 2026, has_banner: true, about_location: "Jeddah, Saudi Arabia", about_languages: [], about_genres: [] };
const DIVIDER_URL = `${ORIGIN}${DIVIDER_IMAGE_PATH}`;
const input = (over = {}) => ({
  identity: IDENTITY, extras: EXTRAS, handle: "black", profileUrl: `${ORIGIN}/@black`, videoUrl: `${ORIGIN}/@black/intro.webm?v=abcd1234`,
  supabaseUrl: SUPABASE, version: "abcd1234", dividerUrl: DIVIDER_URL, ...over,
});
const DIVIDER_GALLERY = { type: 12, items: [{ media: { url: DIVIDER_URL } }] };
const isDivider = part => JSON.stringify(part) === JSON.stringify(DIVIDER_GALLERY);
const shape = card => card.component.components.map(part => (isDivider(part) ? "line" : part.type));
const flatten = node => [node, ...(node?.components || []).flatMap(flatten), ...(node?.accessory ? [node.accessory] : [])];
const parts = card => flatten(card.component);
const texts = card => parts(card).filter(part => part.type === 10).map(part => part.content);

// ------------------------------------------------------------------------------------------------------------------------------ layout
test("the card is the Version A layout: header, Banner, Intro and footer, with a purple divider image between each part", () => {
  const card = buildDiscordCard(input());
  assert.equal(card.component.type, 17);
  assert.equal(card.component.accent_color, 0xb14cff, "the purple accent");
  assert.deepEqual(shape(card), [9, "line", 12, "line", 10, 12, "line", 9]);
  const [header, , banner, , introTitle, intro, , footer] = card.component.components;
  assert.deepEqual(header.components.map(part => part.content), ["## Espada\n\\@black · **GAMID**", "-# CONTENT CREATOR · PLAYER · \\+3 more", "-# 📍 Jeddah, Saudi Arabia"]);
  assert.equal(header.accessory.type, 11);
  assert.equal(header.accessory.media.url, `${SUPABASE}/functions/v1/social-card?handle=black&variant=avatar&v=abcd1234`);
  assert.deepEqual(banner.items.map(item => item.media.url), [`${SUPABASE}/functions/v1/profile-banner/black?v=abcd1234`]);
  assert.equal(introTitle.content, "### 🎮 My Gaming Intro");
  assert.deepEqual(intro.items.map(item => item.media.url), [`${ORIGIN}/@black/intro.webm?v=abcd1234`]);
  assert.equal(footer.components[0].content, "**Explore Espada's GamID**");
  assert.deepEqual(footer.accessory, { type: 2, style: 5, label: "Open GamID", url: `${ORIGIN}/@black` });
});

test("dividers: a decorative one-item gallery of the site's own line image (no ALT text); without a dividerUrl, Version A's native Separators", () => {
  assert.match(DIVIDER_IMAGE_PATH, /^\/assets\/discord-divider-[a-z]+\.(png|gif)\?v=\d+$/);
  const lines = buildDiscordCard(input()).component.components.filter(isDivider);
  assert.equal(lines.length, 3);
  for (const line of lines) assert.equal(line.items[0].description, undefined);
  const native = buildDiscordCard(input({ dividerUrl: undefined }));
  assert.deepEqual(native.component.components.map(part => part.type), [9, 14, 12, 14, 10, 12, 14, 9], "the rollback baseline");
  for (const sep of native.component.components.filter(part => part.type === 14)) assert.deepEqual(sep, { type: 14, divider: true, spacing: 2 });
});

test("divider images: the committed assets are 1200 x 8 (a thin line at any card width) and small", () => {
  for (const [file, magic] of [["discord-divider-purple.png", "\x89PNG"], ["discord-divider-gradient.gif", "GIF89a"]]) {
    let bytes;
    try { bytes = readFileSync(new URL(`../dist/assets/${file}`, import.meta.url)); } catch { continue; }   // the GIF exists only from the B2 test on
    assert.equal(bytes.subarray(0, magic.length).toString("latin1"), magic, file);
    const [width, height] = magic === "GIF89a" ? [bytes.readUInt16LE(6), bytes.readUInt16LE(8)] : [bytes.readUInt32BE(16), bytes.readUInt32BE(20)];
    assert.deepEqual([width, height], [1200, 8], file);
    assert.ok(bytes.length <= 150_000, `${file} is ${bytes.length} bytes`);
  }
  assert.ok(readFileSync(new URL(`../dist${DIVIDER_IMAGE_PATH.split("?")[0]}`, import.meta.url)).length > 0, "the image the card points at exists");
});

test("Open GamID is the ONLY link: '+N more' is plain text, and no text component carries a markdown link or a bare URL", () => {
  const card = buildDiscordCard(input());
  const buttons = parts(card).filter(part => part.type === 2);
  assert.equal(buttons.length, 1);
  assert.equal(buttons[0].url, `${ORIGIN}/@black`, "directly to the profile - no intermediate page");
  for (const content of texts(card)) {
    assert.doesNotMatch(content, /\]\(|https?:\/\//, content);
  }
  assert.match(texts(card)[1], /\\\+3 more$/);
});

test("roles: primary first, then the saved order; two named, the rest counted; none at all leaves the line out", () => {
  assert.deepEqual(roleSummary(IDENTITY), { shown: ["CONTENT CREATOR", "PLAYER"], more: 3 });
  assert.equal(roleLine({ ...IDENTITY, role_keys: ["content_creator"] }), "CONTENT CREATOR");
  assert.equal(roleLine({ ...IDENTITY, role_keys: ["content_creator", "player"] }), "CONTENT CREATOR · PLAYER");
  assert.equal(roleLine({ role_catalog: CATALOG, primary_role_key: null, role_keys: [] }), "");
  const card = buildDiscordCard(input({ identity: { ...IDENTITY, primary_role_key: null, role_keys: [] } }));
  assert.equal(card.component.components[0].components.length, 2, "name + location only");
});

test("missing public values are never invented: no Banner, no Location, no Intro each simply leave their part out", () => {
  const bare = buildDiscordCard(input({ extras: { ...EXTRAS, has_banner: false, about_location: null }, videoUrl: null }));
  assert.deepEqual(shape(bare), [9, "line", 9], "dividers only between parts that exist - never two in a row, none at the ends");
  const bannerOnly = buildDiscordCard(input({ videoUrl: null }));
  assert.deepEqual(shape(bannerOnly), [9, "line", 12, "line", 9]);
  assert.equal(bare.component.components[0].components.length, 2);
  assert.doesNotMatch(JSON.stringify(bare), /profile-banner|intro\.webm|📍|My Gaming Intro/);
  const noExtras = buildDiscordCard(input({ extras: null }));
  assert.doesNotMatch(JSON.stringify(noExtras), /profile-banner|📍/, "a failed extras lookup is treated as nothing to show");
  assert.equal(locationLine({ about_location: "   " }), "");
});

test("no gender (or any field GamID does not have) appears; only the public identity and extras fields are read", () => {
  const source = read("cf-worker/discord-card.mjs");
  assert.doesNotMatch(source, /gender|\bsex\b|bio\b|avatar_media_reference|intro_derivative_path|public_sections/i);
  const json = JSON.stringify(buildDiscordCard(input()));
  assert.doesNotMatch(json, /07991366|avatar-1\.jpg|intro-d3|storage\/v1|sb_publishable|Gamer who loves/, "no storage path, key or bio in the payload");
});

test("a null identity (unknown, unpublished, PRIVATE) produces no card at all", () => {
  assert.equal(buildDiscordCard(input({ identity: null })), null);
  assert.equal(componentEmbedScript(input({ identity: null })), "");
});

// ------------------------------------------------------------------------------------------------------------------------------ safety
test("markdown in user values is shown literally: names and locations cannot add links, mentions, headings or formatting", () => {
  const evil = "**Bold** [x](https://evil.example) @everyone # h <b>";
  assert.equal(escapeMarkdown("a*b"), "a\\*b");
  const card = buildDiscordCard(input({ identity: { ...IDENTITY, display_name: evil }, extras: { ...EXTRAS, about_location: "[Jeddah](https://x.example)" } }));
  for (const content of texts(card)) {
    assert.doesNotMatch(content, /(^|[^\\])\[|(^|[^\\])\*\*B|(^|[^\\])@everyone|https:\/\//, content);
  }
  assert.match(texts(card)[0], /^## /, "the only heading is the card's own");
  assert.doesNotMatch(texts(card)[0].split("\n")[0].slice(3), /\n/);
});

test("line breaks and control characters in values are collapsed, so a value can never add a line of its own", () => {
  const card = buildDiscordCard(input({ identity: { ...IDENTITY, display_name: "A\nB C\tD" } }));
  assert.equal(texts(card)[0], "## A B C D\n\\@black · **GAMID**");
  assert.ok(texts(card).slice(1, 3).every(line => line.startsWith("-# ")), "roles and Location are subtext lines; the prefix itself is never escaped");
});

test("embedJson cannot close the <script> element or start markup, and still parses back to the same card", () => {
  const card = buildDiscordCard(input({ identity: { ...IDENTITY, display_name: "</script><img src=x>&" } }));
  const json = embedJson(card);
  assert.doesNotMatch(json, /[<>&]/);
  assert.deepEqual(JSON.parse(json), card);
});

test("the payload stays within Discord's 3,000-byte cap for the real @black shape, and long values degrade instead of overflowing", () => {
  const script = componentEmbedScript(input());
  const json = script.replace(/^<script id="discord:component-embed" type="application\/json">/, "").replace(/<\/script>$/, "");
  assert.ok(new TextEncoder().encode(json).length <= COMPONENT_EMBED_MAX_BYTES);
  const long = componentEmbedScript(input({ identity: { ...IDENTITY, display_name: "Ж".repeat(200), role_catalog: CATALOG.map(c => ({ ...c, label: "Щ".repeat(60) })) } }));
  assert.ok(long === "" || new TextEncoder().encode(long).length <= COMPONENT_EMBED_MAX_BYTES + 80);
});

// ------------------------------------------------------------------------------------------------------------------------------ the extras lookup
test("fetchPublicExtras: the same anonymous RPC the profile page calls - POST, apikey only, candidate_handle body; fails SAFE to null", async () => {
  const calls = [];
  const rows = await fetchPublicExtras("black", { supabaseUrl: SUPABASE, publishableKey: "anon-key", fetchImpl: async (url, init) => { calls.push([url, init]); return { ok: true, json: async () => [EXTRAS] }; } });
  assert.deepEqual(rows, EXTRAS);
  assert.equal(calls[0][0], `${SUPABASE}/rest/v1/rpc/get_public_profile_extras`);
  assert.equal(calls[0][1].method, "POST");
  assert.deepEqual(Object.keys(calls[0][1].headers).sort(), ["apikey", "content-type"]);
  assert.deepEqual(JSON.parse(calls[0][1].body), { candidate_handle: "black" });
  for (const fetchImpl of [async () => ({ ok: false }), async () => { throw new Error("down"); }, async () => ({ ok: true, json: async () => [] }), async () => ({ ok: true, json: async () => "x" })]) {
    assert.equal(await fetchPublicExtras("black", { supabaseUrl: SUPABASE, publishableKey: "k", fetchImpl }), null);
  }
});

// ------------------------------------------------------------------------------------------------------------------------------ end to end through the Worker
test("the /@black page head carries exactly one parseable component embed; the OG tags and the body are unchanged", async () => {
  const shell = read("dist/public/index.html");
  const original = globalThis.fetch;
  globalThis.fetch = async url => ({ ok: true, json: async () => (String(url).includes("get_public_profile_extras") ? [EXTRAS] : [IDENTITY]) });
  try {
    const env = { ASSETS: { fetch: async () => new Response(shell, { status: 200, headers: { "content-type": "text/html" } }) } };
    const html = await (await worker.fetch(new Request(`${ORIGIN}/@black`), env)).text();
    const scripts = [...html.matchAll(/<script id="discord:component-embed" type="application\/json">(.*?)<\/script>/g)];
    assert.equal(scripts.length, 1);
    assert.ok(html.indexOf(scripts[0][0]) < html.indexOf("</head>"), "in the head");
    const card = JSON.parse(scripts[0][1]);
    assert.equal(card.component.components.at(-1).accessory.url, `${ORIGIN}/@black`);
    assert.equal(card.component.components[1].items[0].media.url, DIVIDER_URL, "the divider image is this site's own asset");
    assert.match(html, /property="og:video" content="https:\/\/gamid-testing-static\.gamid\.workers\.dev\/@black\/intro\.webm\?v=[0-9a-f]{8}"/);
    assert.match(JSON.stringify(card), /\/@black\/intro\.webm\?v=[0-9a-f]{8}/, "the card plays the same Intro URL as og:video");
    assert.equal(html.slice(html.indexOf("<body>")), shell.slice(shell.indexOf("<body>")));
  } finally {
    globalThis.fetch = original;
  }
});

// ------------------------------------------------------------------------------------------------------------------------------ the avatar tile (social-card variant=avatar)
test("avatar tile: a square image of the avatar, or the letter tile when there is none / the identity is not public", () => {
  assert.equal(AVATAR_TILE_SIZE, 256);
  const image = buildAvatarTileElement({ displayName: "Espada", handle: "black", avatarDataUri: "data:image/png;base64,AAAA" });
  assert.equal(image.type, "img");
  assert.equal(image.props.src, "data:image/png;base64,AAAA");
  const letter = buildAvatarTileElement({ displayName: null, handle: "black", avatarDataUri: null });
  assert.equal(letter.type, "div");
  assert.deepEqual(letter.props.children, ["B"]);
  assert.equal(avatarLetter("@x", "zshot"), "Z");
  assert.equal(avatarLetter("", ""), "?");
  assert.equal(isAvatarVariant(new URLSearchParams("handle=black&variant=avatar")), true);
  assert.equal(isAvatarVariant(new URLSearchParams("handle=black")), false);
});

test("social-card glue: variant=avatar reuses the same identity check, avatar fetch and conversion, renders 256x256, and keeps the card path unchanged", () => {
  const glue = read("supabase/functions/social-card/index.ts");
  assert.match(glue, /isAvatarVariant\(url\.searchParams\)/);
  assert.match(glue, /renderCard\(element, AVATAR_TILE_SIZE, AVATAR_TILE_SIZE\)/);
  assert.match(glue, /resolveAvatarDataUri\(avatar, \{ convertWebpToPng \}\)/);
  assert.equal((glue.match(/fetchAvatarBytes\(/g) || []).length, 1, "one avatar fetch, shared by both variants");
  const shared = read("supabase/functions/_shared/social-avatar.js");
  assert.doesNotMatch(shared, /fetch\(|storage\/v1|sb_publishable|service_role/i, "the tile module only builds elements");
});
