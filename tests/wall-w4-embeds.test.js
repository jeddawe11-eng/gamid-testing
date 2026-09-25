// The provider-neutral Link / Embed Engine: URL recognition for every provider, canonical normalisation, presentation rules, the safe player (facade -> tap -> inline or
// larger in-page player, one active player per provider, obvious close, destroyed frames), provider-failure fallback, mixed-provider Walls, and the CSP / database
// contracts that keep the adapters, the page and the SQL validator identical.
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createDocument, createElement } from "../dist/wall/schema.js";
import { validateDocument } from "../dist/wall/validate.js";
import { renderDocument } from "../dist/wall/render.js";
import { elementRegistry } from "../dist/wall/elements.js";
import { providerRegistry } from "../dist/wall/providers.js";
import "../dist/wall-kit/register.js";
import { PROVIDERS, detectEmbed, buildEmbedPayload, defaultEmbedSize, frameOrigins, isAllowedFrameUrl, isAllowedOpenUrl, validateEmbedData, humanReason, PRESENTATIONS } from "../dist/wall-kit/embed/engine.js";
import { createPlayerManager, resolveFrameUrl, fitsInline, fitFrame, expandedSize, ratioOf } from "../dist/wall-kit/embed/player.js";
import { paintDocument } from "../dist/wall-kit/paint.js";
import * as ops from "../dist/wall-kit/ops.js";

const read = path => readFileSync(path, "utf8").replace(/\r\n/g, "\n");

// ---------- recognition: every provider, every supported URL shape ----------
const CASES = [
  // [url, provider, kind, id, presentations]
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "video", "dQw4w9WgXcQ", ["embed", "card", "link"]],
  ["https://www.youtube.com/watch?v=dQw4w9WgXcQ&list=PLx&t=42s", "youtube", "video", "dQw4w9WgXcQ"],
  ["https://m.youtube.com/watch?v=dQw4w9WgXcQ", "youtube", "video", "dQw4w9WgXcQ"],
  ["https://youtu.be/dQw4w9WgXcQ?si=abc", "youtube", "video", "dQw4w9WgXcQ"],
  ["youtu.be/dQw4w9WgXcQ", "youtube", "video", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/shorts/abcdEFGhijk", "youtube", "video", "abcdEFGhijk"],
  ["https://www.youtube.com/live/abcdEFGhijk", "youtube", "video", "abcdEFGhijk"],
  ["https://www.youtube.com/embed/dQw4w9WgXcQ", "youtube", "video", "dQw4w9WgXcQ"],
  ["https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ", "youtube", "video", "dQw4w9WgXcQ"],
  ["https://www.youtube.com/playlist?list=PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-", "youtube", "playlist", "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-", ["embed", "card", "link"]],
  ["https://www.youtube.com/@MrBeast", "youtube", "channel", "@MrBeast", ["card", "link"]],
  ["https://www.youtube.com/channel/UCX6OQ3DkcsbYNE6H8uQQuVA", "youtube", "channel", "UCX6OQ3DkcsbYNE6H8uQQuVA", ["card", "link"]],
  ["https://open.spotify.com/track/4uLU6hMCjMI75M1A2tKUQC?si=abc", "spotify", "track", "4uLU6hMCjMI75M1A2tKUQC", ["embed", "card", "link"]],
  ["https://open.spotify.com/album/4uLU6hMCjMI75M1A2tKUQC", "spotify", "album", "4uLU6hMCjMI75M1A2tKUQC"],
  ["https://open.spotify.com/intl-de/playlist/37i9dQZF1DXcBWIGoYBM5M", "spotify", "playlist", "37i9dQZF1DXcBWIGoYBM5M"],
  ["https://open.spotify.com/episode/4uLU6hMCjMI75M1A2tKUQC", "spotify", "episode", "4uLU6hMCjMI75M1A2tKUQC"],
  ["https://open.spotify.com/show/4uLU6hMCjMI75M1A2tKUQC", "spotify", "show", "4uLU6hMCjMI75M1A2tKUQC"],
  ["https://open.spotify.com/artist/4uLU6hMCjMI75M1A2tKUQC", "spotify", "artist", "4uLU6hMCjMI75M1A2tKUQC"],
  ["https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC", "spotify", "track", "4uLU6hMCjMI75M1A2tKUQC"],
  ["https://www.twitch.tv/shroud", "twitch", "channel", "shroud", ["embed", "card", "link"]],
  ["https://twitch.tv/Shroud", "twitch", "channel", "Shroud"],
  ["https://www.twitch.tv/videos/123456789", "twitch", "video", "123456789"],
  ["https://www.twitch.tv/shroud/clip/FunnySlug-abcdef", "twitch", "clip", "FunnySlug-abcdef"],
  ["https://clips.twitch.tv/FunnySlug-abcdef", "twitch", "clip", "FunnySlug-abcdef"],
  ["https://www.tiktok.com/@scout2015/video/6718335390845095173", "tiktok", "video", "6718335390845095173", ["embed", "card", "link"]],
  ["https://www.tiktok.com/@scout2015", "tiktok", "profile", "@scout2015", ["card", "link"]],
  ["https://www.instagram.com/p/CuY0Yv7Bv2k/", "instagram", "post", "CuY0Yv7Bv2k", ["embed", "card", "link"]],
  ["https://www.instagram.com/natgeo/p/CuY0Yv7Bv2k/", "instagram", "post", "CuY0Yv7Bv2k"],
  ["https://www.instagram.com/reel/CuY0Yv7Bv2k/", "instagram", "reel", "CuY0Yv7Bv2k"],
  ["https://www.instagram.com/natgeo/", "instagram", "profile", "natgeo", ["card", "link"]],
  ["https://x.com/jack/status/20", "x", "post", "20", ["embed", "card", "link"]],
  ["https://twitter.com/jack/status/20?s=20", "x", "post", "20"],
  ["https://x.com/jack", "x", "profile", "jack", ["card", "link"]],
  ["https://discord.gg/abcDEF", "discord", "invite", "abcDEF", ["card", "link"]],
  ["https://discord.com/invite/abc-def", "discord", "invite", "abc-def"],
  ["https://store.steampowered.com/app/730/CounterStrike_2/", "steam", "app", "730", ["embed", "card", "link"]],
  ["https://steamcommunity.com/id/gabelogannewell", "steam", "profile", "gabelogannewell", ["card", "link"]],
  ["https://steamcommunity.com/profiles/76561197960287930", "steam", "profile", "76561197960287930"],
  ["https://steamcommunity.com/groups/steam", "steam", "group", "steam", ["card", "link"]],
];

test("recognition: every supported URL shape maps to (provider, kind, id) with the right presentation choices", () => {
  for (const [url, provider, kind, id, presentations] of CASES) {
    const found = detectEmbed(url);
    assert.equal(found.ok, true, url);
    assert.deepEqual([found.providerKey, found.kind, found.id], [provider, kind, id], url);
    if (presentations) assert.deepEqual(found.presentations, presentations, url);
    assert.equal(found.defaultPresentation, found.presentations[0]);
    assert.ok(found.canonicalUrl.startsWith("https://"), url);
  }
});

test("recognition: all eight initial providers are registered, and every one is reachable by a recognised URL", () => {
  assert.deepEqual([...PROVIDERS.keys()].sort(), ["discord", "instagram", "spotify", "steam", "tiktok", "twitch", "x", "youtube"]);
  assert.deepEqual([...new Set(CASES.map(entry => entry[1]))].sort(), [...PROVIDERS.keys()].sort());
  for (const key of PROVIDERS.keys()) assert.ok(providerRegistry.has(key), `${key} is registered with the Wall core's provider registry`);
});

test("normalisation: different addresses for the same content give the same stored parts and the same canonical URL", () => {
  const forms = ["https://www.youtube.com/watch?v=dQw4w9WgXcQ", "https://youtu.be/dQw4w9WgXcQ?t=9", "youtube.com/watch?v=dQw4w9WgXcQ&feature=share", "https://m.youtube.com/watch?v=dQw4w9WgXcQ", "https://www.youtube.com/embed/dQw4w9WgXcQ"];
  const canon = forms.map(form => detectEmbed(form)).map(found => [found.providerKey, found.kind, found.id, found.canonicalUrl]);
  for (const entry of canon) assert.deepEqual(entry, canon[0]);
  assert.equal(canon[0][3], "https://www.youtube.com/watch?v=dQw4w9WgXcQ");
  assert.equal(detectEmbed("https://twitter.com/jack/status/20").canonicalUrl, detectEmbed("https://x.com/jack/status/20").canonicalUrl);
  assert.equal(detectEmbed("  https://discord.gg/abcDEF  ").id, "abcDEF", "surrounding whitespace is ignored");
});

test("recognition: default aspect and starting size follow the content (a Short is portrait, a video is 16:9)", () => {
  assert.equal(detectEmbed("https://youtube.com/shorts/abcdEFGhijk").aspect, "9:16");
  assert.equal(detectEmbed("https://youtu.be/dQw4w9WgXcQ").aspect, "16:9");
  assert.equal(detectEmbed("https://www.tiktok.com/@scout2015/video/6718335390845095173").aspect, "9:16");
  assert.deepEqual(defaultEmbedSize(detectEmbed("https://youtu.be/dQw4w9WgXcQ"), "embed"), { width: 800, height: 450 });
  assert.ok(defaultEmbedSize(detectEmbed("https://youtu.be/dQw4w9WgXcQ"), "link").height < defaultEmbedSize(detectEmbed("https://youtu.be/dQw4w9WgXcQ"), "card").height);
});

test("rejection: not-a-URL, unsafe schemes, credentials, unsupported sites and unrecognised pages get a specific, human reason", () => {
  const reason = text => detectEmbed(text).reason;
  assert.equal(reason("just some words"), "NOT_A_URL");
  assert.equal(reason(""), "NOT_A_URL");
  assert.equal(reason("<iframe src=\"https://www.youtube.com/embed/dQw4w9WgXcQ\"></iframe>"), "NOT_A_URL", "embed code is never accepted");
  assert.equal(reason("javascript:alert(1)"), "UNSAFE_URL");
  assert.equal(reason("data:text/html,<script>alert(1)</script>"), "UNSAFE_URL");
  assert.equal(reason("file:///etc/passwd"), "UNSAFE_URL");
  assert.equal(reason("ftp://www.youtube.com/watch?v=dQw4w9WgXcQ"), "UNSAFE_URL");
  assert.equal(reason("https://user:pw@www.youtube.com/watch?v=dQw4w9WgXcQ"), "UNSAFE_URL");
  assert.equal(reason("https://evil.example/watch?v=dQw4w9WgXcQ"), "UNSUPPORTED_SITE");
  assert.equal(reason("https://www.youtube.com.evil.example/watch?v=dQw4w9WgXcQ"), "UNSUPPORTED_SITE", "look-alike hosts are not the provider");
  assert.equal(reason("https://evil.example/https://www.youtube.com/watch?v=dQw4w9WgXcQ"), "UNSUPPORTED_SITE");
  assert.equal(reason("https://www.youtube.com/"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://www.youtube.com/watch?v=short"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://open.spotify.com/user/someone"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://vm.tiktok.com/ZMabcdef/"), "UNSUPPORTED_SITE", "short links cannot be resolved without following a third-party redirect");
  assert.equal(reason("https://x.com/home"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://www.instagram.com/explore/"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("https://www.twitch.tv/directory"), "UNRECOGNIZED_CONTENT");
  assert.equal(reason("x".repeat(3000)), "NOT_A_URL");
  for (const code of ["NOT_A_URL", "UNSAFE_URL", "UNSUPPORTED_SITE", "UNRECOGNIZED_CONTENT"]) assert.ok(humanReason[code].length > 20);
  assert.match(humanReason.UNSUPPORTED_SITE, /YouTube.*Steam/, "the supported list is generated from the registered providers");
});

// ---------- payloads: only parts are stored, never a URL or markup ----------
test("payload: only provider key, kind, id, presentation (+ aspect, caption) are stored - the pasted URL never is", () => {
  const found = detectEmbed("https://www.youtube.com/watch?v=dQw4w9WgXcQ&utm_source=evil");
  const { payload, errors } = buildEmbedPayload(found, { presentation: "embed", caption: "Trailer" });
  assert.deepEqual(errors, []);
  assert.deepEqual(payload, { providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed", caption: "Trailer" } });
  assert.doesNotMatch(JSON.stringify(payload), /https?:|utm_source|evil/);
  const shorts = buildEmbedPayload(detectEmbed("https://youtube.com/shorts/abcdEFGhijk"), { presentation: "embed" });
  assert.equal(shorts.payload.data.aspect, "9:16", "a Short is stored portrait (it differs from the kind's 16:9 default)");
  assert.equal(buildEmbedPayload(detectEmbed("https://youtu.be/dQw4w9WgXcQ"), { presentation: "embed" }).payload.data.aspect, undefined, "the default aspect is not repeated");
  assert.equal(buildEmbedPayload(detectEmbed("https://youtu.be/dQw4w9WgXcQ"), { presentation: "embed", aspect: "9:16" }).payload.data.aspect, "9:16");
});

test("payload: a presentation a kind cannot do is refused (a Discord invite or a channel is never a player)", () => {
  assert.deepEqual(buildEmbedPayload(detectEmbed("https://discord.gg/abcDEF"), { presentation: "embed" }).errors, ["INVALID_PRESENTATION"]);
  assert.deepEqual(buildEmbedPayload(detectEmbed("https://www.youtube.com/@MrBeast"), { presentation: "embed" }).errors, ["INVALID_PRESENTATION"]);
  assert.deepEqual(buildEmbedPayload(detectEmbed("https://steamcommunity.com/groups/steam"), { presentation: "embed" }).errors, ["INVALID_PRESENTATION"]);
  assert.deepEqual(buildEmbedPayload(detectEmbed("https://store.steampowered.com/app/730/"), { presentation: "embed" }).errors, []);
});

test("payload: the Wall core validates it through the registered adapter, and rejects everything the adapter rejects", () => {
  const doc = data => { const d = createDocument(); d.stages[0].elements = [createElement({ id: "e", type: "embed", x: 0, y: 0, width: 400, height: 300, payload: { providerKey: "youtube", data } })]; return d; };
  assert.equal(validateDocument(doc({ kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" })).valid, true);
  assert.deepEqual(validateDocument(doc({ kind: "video", id: "nope", presentation: "embed" })).errors, ["PROVIDER:INVALID_ID:e"]);
  assert.deepEqual(validateDocument(doc({ kind: "reel", id: "dQw4w9WgXcQ", presentation: "embed" })).errors, ["PROVIDER:INVALID_KIND:e"]);
  assert.deepEqual(validateDocument(doc({ kind: "video", id: "dQw4w9WgXcQ", presentation: "iframe" })).errors, ["PROVIDER:INVALID_PRESENTATION:e"]);
  assert.deepEqual(validateDocument(doc({ kind: "video", id: "dQw4w9WgXcQ", presentation: "card", caption: "<script>" })).errors.sort(), ["UNSAFE_PAYLOAD_CONTENT:e.payload.data.caption"].sort());
  const unknown = doc({ kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" });
  unknown.stages[0].elements[0].payload.providerKey = "myspace";
  assert.deepEqual(validateDocument(unknown).errors, ["UNSUPPORTED_PROVIDER:e"]);
});

test("adapters: validation is per provider - ids, kinds and presentations differ, and no provider accepts another's shape", () => {
  const good = { youtube: { kind: "video", id: "dQw4w9WgXcQ" }, spotify: { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC" }, twitch: { kind: "channel", id: "shroud" }, tiktok: { kind: "video", id: "6718335390845095173" }, instagram: { kind: "post", id: "CuY0Yv7Bv2k" }, x: { kind: "post", id: "20" }, discord: { kind: "invite", id: "abcDEF" }, steam: { kind: "app", id: "730" } };
  for (const [key, data] of Object.entries(good)) {
    assert.deepEqual(validateEmbedData(PROVIDERS.get(key), { ...data, presentation: "card" }), [], key);
    for (const [otherKey, other] of Object.entries(good)) if (otherKey !== key && !Object.hasOwn(PROVIDERS.get(key).kinds, other.kind)) assert.deepEqual(validateEmbedData(PROVIDERS.get(key), { ...other, presentation: "card" }), ["INVALID_KIND"], `${key} rejects ${otherKey}'s kind`);
  }
  assert.deepEqual(validateEmbedData(PROVIDERS.get("spotify"), { kind: "track", id: "dQw4w9WgXcQ", presentation: "card" }), ["INVALID_ID"]);
  assert.deepEqual(validateEmbedData(PROVIDERS.get("x"), { kind: "post", id: "20", presentation: "card", caption: "c".repeat(81) }), ["INVALID_CAPTION"]);
  assert.deepEqual(validateEmbedData(PROVIDERS.get("x"), { kind: "post", id: "20", presentation: "card", aspect: "2:1" }), ["INVALID_ASPECT"]);
  assert.deepEqual(validateEmbedData(PROVIDERS.get("x"), { kind: "toString", id: "20", presentation: "card" }), ["INVALID_KIND"], "prototype keys are not kinds");
});

// ---------- capability model / descriptors ----------
test("capabilities: inline players exist only where the provider has an official player; everything else is a card or link - nothing is faked", () => {
  const inline = Object.fromEntries([...PROVIDERS.values()].map(provider => [provider.key, Object.entries(provider.kinds).filter(([, kind]) => kind.inline).map(([name]) => name).sort()]));
  assert.deepEqual(inline, {
    discord: [], instagram: ["post", "reel"], spotify: ["album", "artist", "episode", "playlist", "show", "track"], steam: ["app"],
    tiktok: ["video"], twitch: ["channel", "clip", "video"], x: ["post"], youtube: ["playlist", "video"],
  });
  assert.deepEqual(PROVIDERS.get("discord").frameOrigins, [], "Discord loads nothing from the Wall");
});

test("descriptor: plain data only - no markup, no functions; the player address is rebuilt by the adapter and only when a player is chosen", () => {
  const render = (providerKey, data) => elementRegistry.get("embed").render({ providerKey, data }).content;
  const player = render("youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" });
  assert.equal(player.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1");
  assert.equal(player.inline, true);
  assert.deepEqual(player.minInline, { w: 200, h: 112 });
  const card = render("youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" });
  assert.equal(card.embedUrl, null, "a card never carries a player address");
  assert.equal(card.inline, false);
  assert.equal(render("youtube", { kind: "channel", id: "@MrBeast", presentation: "card" }).profile, true);
  for (const descriptor of [player, card]) assert.equal(JSON.stringify(descriptor).includes("<"), false);
  assert.match(render("twitch", { kind: "channel", id: "shroud", presentation: "embed" }).embedUrl, /\{parent\}/, "Twitch's required parent is filled in at play time from the page host");
  assert.equal(render("spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" }).embedUrl, "https://open.spotify.com/embed/track/4uLU6hMCjMI75M1A2tKUQC?utm_source=generator");
  assert.equal(render("steam", { kind: "app", id: "730", presentation: "embed" }).embedUrl, "https://store.steampowered.com/widget/730/");
  assert.equal(render("tiktok", { kind: "video", id: "6718335390845095173", presentation: "embed" }).embedUrl, "https://www.tiktok.com/embed/v2/6718335390845095173");
  assert.equal(render("instagram", { kind: "post", id: "CuY0Yv7Bv2k", presentation: "embed" }).embedUrl, "https://www.instagram.com/p/CuY0Yv7Bv2k/embed/");
  assert.equal(render("x", { kind: "post", id: "20", presentation: "embed" }).embedUrl, "https://platform.twitter.com/embed/Tweet.html?id=20&dnt=true&theme=dark");
});

test("every address a player loads or a visitor follows stays inside its own provider's allowlist (frame origins and hosts)", () => {
  for (const provider of PROVIDERS.values()) {
    for (const [name, kind] of Object.entries(provider.kinds)) {
      const id = { youtube: { video: "dQw4w9WgXcQ", playlist: "PLrEnWoR732-BHrPp_Pm8_VleD68f9s14-", channel: "@MrBeast" }, spotify: Object.fromEntries(Object.keys(provider.kinds).map(k => [k, "4uLU6hMCjMI75M1A2tKUQC"])), twitch: { channel: "shroud", video: "123456789", clip: "Funny-abcdef" }, tiktok: { video: "6718335390845095173", profile: "@scout2015" }, instagram: { post: "CuY0Yv7Bv2k", reel: "CuY0Yv7Bv2k", profile: "natgeo" }, x: { post: "20", profile: "jack" }, discord: { invite: "abcDEF" }, steam: { app: "730", profile: "gabelogannewell", group: "steam" } }[provider.key][name];
      assert.equal(isAllowedOpenUrl(provider.key, provider.openUrl(name, id)), true, `${provider.key}/${name} open URL`);
      const embed = provider.embedUrl(name, id);
      if (kind.inline) assert.equal(isAllowedFrameUrl(provider.key, embed.replaceAll("{parent}", "example.com")), true, `${provider.key}/${name} frame URL`);
      else assert.equal(embed, null);
    }
  }
  assert.equal(isAllowedFrameUrl("youtube", "https://evil.example/embed/x"), false);
  assert.equal(isAllowedFrameUrl("youtube", "http://www.youtube-nocookie.com/embed/x"), false, "https only");
  assert.equal(isAllowedFrameUrl("youtube", "https://open.spotify.com/embed/track/x"), false, "another provider's origin is not this provider's");
  assert.equal(isAllowedFrameUrl("youtube", "javascript:alert(1)"), false);
  assert.equal(isAllowedOpenUrl("youtube", "https://evil.example/"), false);
  assert.equal(isAllowedOpenUrl("youtube", "https://user@www.youtube.com/"), false);
  assert.equal(isAllowedOpenUrl("nope", "https://www.youtube.com/"), false);
});

test("the player resolves Twitch's required parent from the page host and refuses anything that is not a plain hostname", () => {
  const descriptor = elementRegistry.get("embed").render({ providerKey: "twitch", data: { kind: "channel", id: "shroud", presentation: "embed" } }).content;
  assert.equal(resolveFrameUrl(descriptor, "gamid-testing-static.gamid.workers.dev"), "https://player.twitch.tv/?channel=shroud&parent=gamid-testing-static.gamid.workers.dev&autoplay=false&muted=true");
  for (const bad of ["", null, "evil.com/x", "a b", "x&parent=evil.com", "javascript:1", "exa mple.com"]) assert.equal(resolveFrameUrl(descriptor, bad), null, String(bad));
  assert.equal(resolveFrameUrl({ ...descriptor, inline: false }, "example.com"), null, "a non-player descriptor never yields a frame");
  assert.equal(resolveFrameUrl({ ...descriptor, providerKey: "youtube" }, "example.com"), null, "a frame URL must belong to the descriptor's own provider");
});

// ---------- sizing / small-media rule ----------
test("small media: below the provider's minimum on screen a player is a tile that opens a larger in-page player; big enough plays inline", () => {
  const yt = elementRegistry.get("embed").render({ providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" } }).content;
  assert.equal(fitsInline(yt, 312, 175), true);
  assert.equal(fitsInline(yt, 199, 300), false);
  assert.equal(fitsInline(yt, 300, 100), false);
  const sp = elementRegistry.get("embed").render({ providerKey: "spotify", data: { kind: "playlist", id: "37i9dQZF1DXcBWIGoYBM5M", presentation: "embed" } }).content;
  assert.equal(fitsInline(sp, 300, 200), false, "W0: a 300x200 playlist renders but is cropped - it must be a tile");
  assert.equal(fitsInline(sp, 300, 352), true);
  assert.equal(fitsInline({ minInline: null }, 1, 1), true);
});

test("aspect: video is never stretched - frames keep the real ratio inside their box; 'auto' providers use the box", () => {
  assert.deepEqual(fitFrame("16:9", 320, 400), { width: 320, height: 180 });
  assert.deepEqual(fitFrame("16:9", 1000, 100), { width: 177, height: 100 });
  assert.deepEqual(fitFrame("9:16", 400, 400), { width: 225, height: 400 });
  assert.deepEqual(fitFrame("1:1", 300, 500), { width: 300, height: 300 });
  assert.deepEqual(fitFrame("4:3", 400, 400), { width: 400, height: 300 });
  assert.deepEqual(fitFrame("auto", 300, 500), { width: 300, height: 500 });
  assert.equal(ratioOf("16:9"), 16 / 9);
  assert.equal(ratioOf("auto"), null);
  const big = expandedSize({ aspect: "16:9" }, 1200, 800);
  assert.ok(big.width <= 960 && Math.abs(big.width / big.height - 16 / 9) < 0.02);
  const portrait = expandedSize({ aspect: "9:16" }, 390, 800);
  assert.ok(portrait.width <= 390 * 0.92 && portrait.height <= 800 * 0.78 && Math.abs(portrait.width / portrait.height - 9 / 16) < 0.02);
  const auto = expandedSize({ aspect: "auto", minInline: { w: 280, h: 352 } }, 390, 800);
  assert.ok(auto.width <= 390 * 0.92 && auto.height <= 800 * 0.78);
});

// ---------- the player manager (fake DOM) ----------
class Node {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.style = { props: new Map(), setProperty(name, value) { this.props.set(name, value); }, removeProperty(name) { this.props.delete(name); } }; this.listeners = {}; this.className = ""; this.textContent = ""; this.parent = null; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { for (const node of nodes) { node.parent = this; this.children.push(node); } }
  remove() { if (this.parent) { this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; } }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  focus() { this.focused = true; }
  fire(type, event = {}) { for (const handler of this.listeners[type] || []) handler({ target: this, key: undefined, ...event }); }
}
const fakeDoc = () => { const doc = new Node("document"); doc.body = new Node("body"); doc.createElement = tag => new Node(tag); doc.removeEventListener = (type, handler) => { doc.listeners[type] = (doc.listeners[type] || []).filter(candidate => candidate !== handler); }; return doc; };
const describe = (providerKey, data) => elementRegistry.get("embed").render({ providerKey, data }).content;
const frames = root => { const out = []; const walk = node => { if (node.tag === "iframe") out.push(node); node.children.forEach(walk); }; walk(root); return out; };

test("player: a tap on a big-enough box plays INLINE in that box, with a sandboxed, allowlisted frame - and nothing loads before the tap", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com", viewport: () => ({ width: 800, height: 600 }) });
  const box = new Node("div");
  assert.equal(frames(box).length, 0, "no frame exists before a tap");
  manager.activate(box, describe("youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }), { widthPx: 320, heightPx: 180 });
  const [frame] = frames(box);
  assert.equal(frame.attrs.src, "https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ?rel=0&modestbranding=1&playsinline=1");
  assert.match(frame.attrs.sandbox, /allow-scripts/);
  assert.doesNotMatch(frame.attrs.sandbox, /allow-top-navigation/);
  assert.equal(frame.attrs.referrerpolicy, "strict-origin-when-cross-origin");
  assert.equal(frame.attrs.loading, "lazy");
  assert.equal(frame.style.props.get("width"), "320px");
  assert.equal(frame.style.props.get("height"), "180px", "the 16:9 ratio is kept");
  assert.equal(manager.expanded, false);
  assert.deepEqual(manager.activeProviders(), ["youtube"]);
});

test("player: a tap on a TILE (below the provider minimum) opens a larger in-page player with an obvious Close; Close, backdrop and Escape all destroy the frame", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com", viewport: () => ({ width: 390, height: 800 }) });
  const tile = new Node("div");
  const descriptor = describe("youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" });
  manager.activate(tile, descriptor, { widthPx: 120, heightPx: 70 });
  assert.equal(frames(tile).length, 0, "the tile itself never becomes a tiny player");
  assert.equal(manager.expanded, true);
  const overlay = doc.body.children[0];
  assert.equal(overlay.attrs.role, "dialog");
  const close = overlay.children.find(child => child.tag === "button");
  assert.match(close.textContent, /Close/);
  assert.equal(close.attrs["aria-label"], "Close player");
  assert.match(close.style.props.get("min-height"), /44px/, "a real touch target");
  assert.equal(close.parent, overlay, "Close sits OUTSIDE the video area");
  const [frame] = frames(overlay);
  assert.equal(frame.attrs.src.startsWith("https://www.youtube-nocookie.com/embed/"), true);
  assert.ok(Number(frame.style.props.get("width").replace("px", "")) <= 390 * 0.92);
  assert.equal(doc.body.style.props.get("overflow"), "hidden", "the page behind does not scroll");
  close.fire("click");
  assert.equal(manager.expanded, false);
  assert.equal(doc.body.children.length, 0, "the overlay is removed");
  assert.equal(frame.attrs.src, "about:blank", "the frame is destroyed, not merely hidden");
  assert.equal(doc.body.style.props.has("overflow"), false);
  // backdrop
  manager.activate(tile, descriptor, { widthPx: 120, heightPx: 70 });
  const second = doc.body.children[0];
  second.fire("click", { target: second });
  assert.equal(manager.expanded, false);
  // escape
  manager.activate(tile, descriptor, { widthPx: 120, heightPx: 70 });
  doc.fire("keydown", { key: "Escape" });
  assert.equal(manager.expanded, false);
  assert.equal((doc.listeners.keydown || []).length, 0, "no stray key handler is left behind");
});

test("player: only ONE active player per provider - starting a second closes the first; different providers can play together", () => {
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com", viewport: () => ({ width: 800, height: 600 }) });
  const a = new Node("div"), b = new Node("div"), c = new Node("div");
  manager.activate(a, describe("youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }), { widthPx: 320, heightPx: 180 });
  const first = frames(a)[0];
  manager.activate(b, describe("youtube", { kind: "video", id: "abcdEFGhijk", presentation: "embed" }), { widthPx: 320, heightPx: 180 });
  assert.equal(frames(a).length, 0);
  assert.equal(first.attrs.src, "about:blank");
  assert.equal(frames(b).length, 1);
  manager.activate(c, describe("spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" }), { widthPx: 320, heightPx: 160 });
  assert.equal(frames(c).length, 1);
  assert.equal(frames(b).length, 1, "another provider is unaffected");
  assert.deepEqual(manager.activeProviders().sort(), ["spotify", "youtube"]);
  manager.destroyAll();
  assert.deepEqual(manager.activeProviders(), []);
  assert.equal(frames(b).length + frames(c).length, 0);
});

test("player: a link/card/no-player descriptor never creates a frame; it opens the content on the provider's own site, and only if the address is allowlisted", () => {
  const opened = [];
  globalThis.open = (...args) => opened.push(args);
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "example.com" });
  const box = new Node("div");
  manager.activate(box, describe("discord", { kind: "invite", id: "abcDEF", presentation: "card" }), { widthPx: 300, heightPx: 100 });
  assert.equal(frames(box).length + frames(doc.body).length, 0);
  assert.deepEqual(opened[0], ["https://discord.gg/abcDEF", "_blank", "noopener,noreferrer"]);
  manager.activate(box, { ...describe("discord", { kind: "invite", id: "abcDEF", presentation: "card" }), openUrl: "https://evil.example/" }, { widthPx: 300, heightPx: 100 });
  assert.equal(opened.length, 1, "a tampered address is never opened");
  delete globalThis.open;
});

test("player failure: a player that cannot be built falls back to opening the content - the Wall keeps working", () => {
  const opened = [];
  globalThis.open = (...args) => opened.push(args);
  const doc = fakeDoc();
  const manager = createPlayerManager({ doc, hostname: "not a host!" });   // Twitch needs a valid parent host
  const box = new Node("div");
  manager.activate(box, describe("twitch", { kind: "channel", id: "shroud", presentation: "embed" }), { widthPx: 500, heightPx: 300 });
  assert.equal(frames(box).length, 0);
  assert.deepEqual(opened[0][0], "https://www.twitch.tv/shroud");
  delete globalThis.open;
});

// ---------- painting: edit facades, view behavior, failures, mixed walls ----------
class PaintNode {
  constructor(tag) { this.tag = tag; this.children = []; this.attrs = {}; this.props = new Map(); this.className = ""; this._text = ""; this.listeners = {}; this.style = { setProperty: (name, value) => this.props.set(name, value) }; }
  setAttribute(name, value) { this.attrs[name] = String(value); }
  append(...nodes) { nodes.forEach(node => this.children.push(node)); }
  appendChild(node) { this.children.push(node); return node; }
  addEventListener(type, handler) { (this.listeners[type] ||= []).push(handler); }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
  set textContent(value) { this._text = String(value); }
  set innerHTML(_) { throw new Error("innerHTML is forbidden"); }
}
const make = tag => new PaintNode(tag);
const all = (node, test, out = []) => { if (test(node)) out.push(node); node.children.forEach(child => all(child, test, out)); return out; };
const wallWith = (...specs) => { const d = createDocument(); d.stages[0].elements = specs.map(([id, providerKey, data, y = 0, width = 600, height = 340]) => createElement({ id, type: "embed", x: 0, y, width, height, z: 0, payload: { providerKey, data } })); return d; };

test("editor facades: EDIT mode paints a static facade - no iframe, no link, no network - and says how it will behave", () => {
  const doc = wallWith(["p", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }], ["c", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }, 400], ["l", "discord", { kind: "invite", id: "abcDEF", presentation: "link" }, 800]);
  const painted = paintDocument(doc, 500, make, { mode: "edit" });
  const root = painted.stages[0];
  assert.equal(all(root, node => node.tag === "iframe").length, 0);
  assert.equal(all(root, node => node.tag === "a").length, 0, "no navigation while editing");
  const text = root.textContent;
  assert.match(text, /Plays in Preview/);
  assert.match(text, /Opens on Steam/);
  assert.match(text, /YOUTUBE/);
  assert.match(text, /@gabelogannewell/);
});

test("visitor rendering: VIEW mode - links/cards are safe anchors to the provider's own host; a player facade starts the player on activation", () => {
  const doc = wallWith(["c", "steam", { kind: "profile", id: "gabelogannewell", presentation: "card" }], ["p", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }, 400]);
  const started = [];
  const players = { activate: (box, descriptor, sizing) => started.push([descriptor.providerKey, sizing.widthPx, sizing.heightPx]) };
  const painted = paintDocument(doc, 500, make, { mode: "view", players });
  const [anchor] = all(painted.stages[0], node => node.tag === "a");
  assert.equal(anchor.attrs.href, "https://steamcommunity.com/id/gabelogannewell");
  assert.equal(anchor.attrs.target, "_blank");
  assert.equal(anchor.attrs.rel, "noopener noreferrer nofollow");
  const [facade] = all(painted.stages[0], node => node.attrs?.role === "button");
  assert.equal(facade.attrs.tabindex, "0");
  facade.listeners.click[0]();
  assert.deepEqual(started, [["youtube", 300, 170]], "the on-screen box size decides inline vs larger player");
  facade.listeners.keydown[0]({ key: "Enter", preventDefault() {} });
  assert.equal(started.length, 2);
});

test("provider failure: if one adapter throws while rendering, that element shows as unavailable and every other element still draws", () => {
  const doc = wallWith(["ok", "steam", { kind: "app", id: "730", presentation: "card" }], ["bad", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" }, 400]);
  const adapter = providerRegistry.get("youtube");
  const original = adapter.render;
  adapter.render = () => { throw new Error("provider exploded"); };
  try {
    const tree = renderDocument(doc, { viewportWidth: 500 });
    assert.equal(tree.ok, true);
    assert.equal(tree.stages[0].elements.find(item => item.id === "bad").content.unavailable, true);
    const painted = paintDocument(doc, 500, make, { mode: "view" });
    assert.equal(painted.ok, true);
    assert.equal(all(painted.stages[0], node => node.className.startsWith("wall-el")).length, 2);
    assert.match(painted.stages[0].textContent, /STEAM/);
  } finally { adapter.render = original; }
});

test("mixed-provider Wall: every provider at once validates, renders through the core and paints, with no iframe until a tap", () => {
  const doc = wallWith(
    ["yt", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" }, 0, 500, 280], ["sp", "spotify", { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" }, 300, 500, 200],
    ["tw", "twitch", { kind: "channel", id: "shroud", presentation: "embed" }, 520, 500, 280], ["tt", "tiktok", { kind: "video", id: "6718335390845095173", presentation: "embed" }, 820, 300, 520],
    ["ig", "instagram", { kind: "post", id: "CuY0Yv7Bv2k", presentation: "card" }, 1360, 500, 200], ["x", "x", { kind: "post", id: "20", presentation: "card" }, 1580, 400, 180],
    ["dc", "discord", { kind: "invite", id: "abcDEF", presentation: "link" }, 1620, 400, 100], ["st", "steam", { kind: "app", id: "730", presentation: "embed" }, 1700, 300, 70],
  );
  assert.deepEqual(validateDocument(doc), { valid: true, errors: [] });
  const painted = paintDocument(doc, 400, make, { mode: "view", players: { activate() {} } });
  assert.equal(all(painted.stages[0], node => node.className.startsWith("wall-el")).length, 8);
  assert.equal(all(painted.stages[0], node => node.tag === "iframe").length, 0);
  assert.deepEqual(new Set(all(painted.stages[0], node => node.attrs?.["data-provider"]).map(node => node.attrs["data-provider"])), new Set(["youtube", "spotify", "twitch", "tiktok", "instagram", "x", "discord", "steam"]));
});

test("no arbitrary HTML/JS/iframe injection: hostile data cannot become markup, a URL, a script or a frame", () => {
  const hostile = createDocument();
  hostile.stages[0].elements = [createElement({ id: "e", type: "embed", x: 0, y: 0, width: 400, height: 200, payload: { providerKey: "youtube", data: { kind: "video", id: "<iframe src=//evil>", presentation: "embed", caption: "<img src=x onerror=alert(1)>" } } })];
  assert.equal(validateDocument(hostile).valid, false);
  assert.equal(paintDocument(hostile, 400, make).ok, false, "an invalid document is never painted");
  // a caption that is plain text is only ever text
  const plain = wallWith(["e", "youtube", { kind: "video", id: "dQw4w9WgXcQ", presentation: "card", caption: "Tom & Jerry \"live\"" }]);
  const painted = paintDocument(plain, 400, make, { mode: "view" });
  assert.match(painted.stages[0].textContent, /Tom & Jerry "live"/);
  assert.equal(all(painted.stages[0], node => node.tag === "script" || node.tag === "iframe").length, 0);
  // the frame-building code has no way to take a URL from a document
  const playerSource = read("dist/wall-kit/embed/player.js");
  assert.doesNotMatch(playerSource.replace(/\/\/.*$/gm, ""), /innerHTML|outerHTML|insertAdjacentHTML|document\.write|eval\(|srcdoc/);
});

test("the editor can resize an embed without stretching it: proportion-locked (fixed-ratio) embeds keep their ratio on every handle", () => {
  let doc = createDocument();
  doc = ops.addCustomElement(doc, "stage_1", { type: "embed", payload: { providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "embed" } }, width: 800, height: 450 }).doc;
  const element = doc.stages[0].elements[0];
  assert.equal(ops.lockedAspect(element), 16 / 9);
  const se = ops.resizeElement(doc, element.id, "se", 100, 900, { keepAspect: true }).doc.stages[0].elements[0];
  assert.ok(Math.abs(se.width / se.height - 16 / 9) < 0.02);
  const east = ops.resizeElement(doc, element.id, "e", -200, 0, { keepAspect: true }).doc.stages[0].elements[0];
  assert.ok(Math.abs(east.width / east.height - 16 / 9) < 0.03, "a side handle scales the whole element");
  const spotify = ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey: "spotify", data: { kind: "track", id: "4uLU6hMCjMI75M1A2tKUQC", presentation: "embed" } }, width: 800, height: 240 }).doc.stages[0].elements[0];
  assert.equal(ops.lockedAspect(spotify), null, "providers with their own layout resize freely");
  const card = ops.addCustomElement(createDocument(), "stage_1", { type: "embed", payload: { providerKey: "youtube", data: { kind: "video", id: "dQw4w9WgXcQ", presentation: "card" } }, width: 800, height: 260 }).doc.stages[0].elements[0];
  assert.equal(ops.lockedAspect(card) !== null, true, "the ratio belongs to the video, whatever the presentation");
});

// ---------- contracts that keep everything identical ----------
test("CSP: the editor page's frame-src is EXACTLY the union of the adapters' frame origins", () => {
  const html = read("dist/wall-editor/index.html");
  const csp = html.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)[1];
  assert.deepEqual(csp.match(/frame-src ([^;]+)/)[1].split(" ").sort(), frameOrigins());
  assert.equal(frameOrigins().every(origin => origin.startsWith("https://")), true);
  assert.doesNotMatch(csp, /frame-src[^;]*\*/);
  assert.match(csp, /script-src 'self'(;|$)/, "providers add frames only - never script origins");
});

test("database parity: the SQL provider table equals the JavaScript adapters (provider, kind, id pattern, inline)", () => {
  const sql = readdirSync("supabase/migrations").filter(name => /_wall_/.test(name)).map(name => read(`supabase/migrations/${name}`)).join("\n");
  const rows = [...sql.matchAll(/\('([a-z]+)', '([a-z0-9]+)', '(\^[^']+\$)', (true|false)\)/g)].map(match => `${match[1]}|${match[2]}|${match[3]}|${match[4]}`).sort();
  const expected = [...PROVIDERS.values()].flatMap(provider => Object.entries(provider.kinds).map(([kind, spec]) => `${provider.key}|${kind}|${spec.id}|${spec.inline}`)).sort();
  assert.deepEqual(rows, expected);
  assert.match(sql, /'ddd'|wall_embed_data_errors/);
});

test("the Wall core stays provider-neutral: presentation vocabulary is generic and the core never names a provider", () => {
  assert.deepEqual([...PRESENTATIONS], ["link", "card", "embed"]);
  const core = readdirSync("dist/wall").filter(name => name.endsWith(".js")).map(name => read(`dist/wall/${name}`)).join("\n");
  assert.doesNotMatch(core, /youtube|spotify|twitch|tiktok|instagram|discord|steam|twitter/i);
});
