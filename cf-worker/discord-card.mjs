// GamID Discord share card (Components V2) - the card Discord shows for a shared /@<handle> link (TESTING only).
//
// Discord reads one <script id="discord:component-embed" type="application/json"> from the page's first response and renders it in place of the Open Graph
// embed; every other platform keeps reading the unchanged OG / Twitter tags. The layout is the approved Share Card lab design (social-lab/worker.mjs shareCard),
// with real public data instead of the synthetic Lab Player, styled as Mazen's approved Version A (2026-10-26): purple accent, a divider with large spacing
// between every part, roles and Location as Discord subtext (-#), the Intro title as a ### heading and a bold footer line.
//   Section: "## <name>" / "@<handle> · **GAMID**", -# the first two Gaming Roles + "+N more" (plain text, never a link), -# the public Location;  avatar thumbnail
//   ── Media Gallery: the public Banner ── "### 🎮 My Gaming Intro" + Media Gallery: the public Intro ──
//   Section: "**Explore <name>'s GamID**" with one link button, Open GamID -> the profile's own /@<handle> URL (no intermediate page)
// Dividers (B1 / B2 live test, 2026-10-26, Mazen's review pending): Discord's native Separator is always grey (it has no colour field), so with a `dividerUrl`
// each ── is a one-item Media Gallery showing a thin accent-coloured image from this site's own assets (scripts/generate-discord-dividers.ps1). Without one the
// card keeps Version A's native Separators, the rollback baseline.
//
// Privacy: built ONLY from what an anonymous visitor's browser already receives - get_public_identity (name, handle, roles, whether there is an Intro) and
// get_public_profile_extras (has_banner, about_location, which is already null unless the owner shows it). No card at all for a null identity, so unknown,
// unpublished and PRIVATE GamIDs keep the identical generic response. Media URLs are the existing anonymous endpoints: the avatar tile and the Banner are
// rendered / served by Supabase Edge Functions that re-check visibility on every request, the Intro by this Worker's own /@<handle>/intro.webm. No storage
// path, key or private value ever reaches the payload.

export const COMPONENT_EMBED_MAX_BYTES = 3000;   // Discord's documented cap for the component-embed JSON
export const SHOWN_ROLES = 2;
export const ACCENT = 0xb14cff;
// a divider line with large padding between the card's parts (Separator: divider true, spacing 2)
const DIVIDER = Object.freeze({ type: 14, divider: true, spacing: 2 });
// B1: the solid #B14CFF line image (the ?v tag changes whenever the image is regenerated, since Discord caches media by URL)
export const DIVIDER_IMAGE_PATH = "/assets/discord-divider-purple.png?v=1";
// a decorative line: no description, so Discord shows no ALT badge on it
const divider = dividerUrl => (dividerUrl ? { type: 12, items: [{ media: { url: dividerUrl } }] } : { ...DIVIDER });
// Discord subtext: a line starting "-# " is shown smaller and muted
const subtext = line => `-# ${line}`;

const catalogLabel = (catalog, key) => catalog?.find?.(item => item.key === key)?.label || key || "";

// Plain single-line text, bounded. Control characters and line breaks are collapsed so no value can add a line or a heading of its own.
export function plainText(value, max) {
  const clean = String(value ?? "").replace(/[\u0000-\u001f\u007f\u2028\u2029]+/g, " ").replace(/\s+/g, " ").trim();
  return clean.length <= max ? clean : `${clean.slice(0, Math.max(max - 1, 0)).trimEnd()}…`;
}

// Discord text components are markdown. Every ASCII punctuation character a user value could use for markdown, a link, a mention or an auto-linked URL is
// backslash-escaped, so a value is always shown literally (Discord drops the backslash before any punctuation).
export const escapeMarkdown = value => String(value).replace(/[\\`*_~|>#\-[\]()<:@!.+=]/g, ch => `\\${ch}`);

// Primary role first, then the others in their saved order. The first SHOWN_ROLES are named; the rest are counted.
export function roleSummary(identity) {
  const keys = [identity?.primary_role_key, ...(identity?.role_keys || []).filter(key => key !== identity?.primary_role_key)].filter(Boolean);
  const labels = keys.map(key => plainText(catalogLabel(identity?.role_catalog, key), 32).toUpperCase()).filter(Boolean);
  return { shown: labels.slice(0, SHOWN_ROLES), more: Math.max(labels.length - SHOWN_ROLES, 0) };
}

export function roleLine(identity) {
  const { shown, more } = roleSummary(identity);
  if (!shown.length) return "";
  return [...shown.map(escapeMarkdown), ...(more ? [`\\+${more} more`] : [])].join(" · ");
}

// The anonymous Location the profile page itself shows; null when the owner hides it (the RPC already returns null then).
export function locationLine(extras) {
  const location = plainText(extras?.about_location, 80);
  return location ? `📍 ${escapeMarkdown(location)}` : "";
}

// Reaches the same anonymous RPC the public profile page calls. Fails SAFE to null on any failure: the card is then built without a Banner or Location.
export async function fetchPublicExtras(handle, { supabaseUrl, publishableKey, fetchImpl = fetch } = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 4000);
  try {
    const res = await fetchImpl(`${supabaseUrl}/rest/v1/rpc/get_public_profile_extras`, {
      method: "POST",
      headers: { apikey: publishableKey, "content-type": "application/json" },
      body: JSON.stringify({ candidate_handle: handle }),
      signal: controller.signal,
    });
    if (!res.ok) return null;
    const rows = await res.json();
    return Array.isArray(rows) && rows[0] && typeof rows[0] === "object" ? rows[0] : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

const tag = (url, version) => (version ? `${url}${url.includes("?") ? "&" : "?"}v=${version}` : url);

export function avatarTileUrl(supabaseUrl, handle, version) {
  return tag(`${supabaseUrl}/functions/v1/social-card?handle=${encodeURIComponent(handle)}&variant=avatar`, version);
}

export function bannerUrl(supabaseUrl, handle, version) {
  return tag(`${supabaseUrl}/functions/v1/profile-banner/${encodeURIComponent(handle)}`, version);
}

// The component tree (a single Container, type 17). `videoUrl` is this Worker's own Intro URL or null; `profileUrl` is the canonical /@<handle> URL;
// `dividerUrl` is the divider image's absolute URL, or absent for native Separators.
export function buildDiscordCard({ identity, extras, handle, profileUrl, videoUrl, supabaseUrl, version, dividerUrl }) {
  if (!identity) return null;
  const name = plainText(identity.display_name, 40) || `@${handle}`;
  const header = [{ type: 10, content: `## ${escapeMarkdown(name)}\n${escapeMarkdown(`@${handle}`)} · **GAMID**` }];
  const roles = roleLine(identity);
  if (roles) header.push({ type: 10, content: subtext(roles) });
  const location = locationLine(extras);
  if (location) header.push({ type: 10, content: subtext(location) });

  // the card's parts in order; only the ones with a public value exist, and a divider goes between each pair
  const blocks = [
    [{ type: 9, components: header, accessory: { type: 11, media: { url: avatarTileUrl(supabaseUrl, handle, version) }, description: `${name} avatar` } }],
  ];
  if (extras?.has_banner === true) blocks.push([{ type: 12, items: [{ media: { url: bannerUrl(supabaseUrl, handle, version) }, description: "Profile banner" }] }]);
  if (videoUrl) blocks.push([{ type: 10, content: "### 🎮 My Gaming Intro" }, { type: 12, items: [{ media: { url: videoUrl } }] }]);
  blocks.push([{ type: 9, components: [{ type: 10, content: `**Explore ${escapeMarkdown(name)}'s GamID**` }], accessory: { type: 2, style: 5, label: "Open GamID", url: profileUrl } }]);
  const components = blocks.flatMap((block, index) => (index ? [divider(dividerUrl), ...block] : block));
  return { component: { type: 17, accent_color: ACCENT, components } };
}

// JSON that is safe inside a <script> element: nothing in it can close the element or start markup.
export const embedJson = card => JSON.stringify(card).replace(/</g, "\\u003c").replace(/>/g, "\\u003e").replace(/&/g, "\\u0026")
  .replace(/\u2028/g, "\\u2028").replace(/\u2029/g, "\\u2029");

const byteLength = text => new TextEncoder().encode(text).length;

// The <script> block for the page head, or "" when there is no card. Over Discord's cap the Location is dropped first, then the Banner; a card that still
// does not fit is left out entirely (Discord then shows the unchanged Open Graph embed) rather than sending a payload Discord would reject.
export function componentEmbedScript(input) {
  const attempts = [input, { ...input, extras: input.extras ? { ...input.extras, about_location: null } : null }, { ...input, extras: null }];
  for (const attempt of attempts) {
    const card = buildDiscordCard(attempt);
    if (!card) return "";
    const json = embedJson(card);
    if (byteLength(json) <= COMPONENT_EMBED_MAX_BYTES) return `<script id="discord:component-embed" type="application/json">${json}</script>`;
  }
  return "";
}
