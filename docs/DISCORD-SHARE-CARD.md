# Discord share card (Components V2)

Status: on TESTING for Mazen's visual review, PENDING_ACCEPTANCE (GamID Truth `discord-share-card`). Implemented under Mazen's task of 2026-10-26, "GamID Discord Components V2: Implement & Deploy to TESTING". Not merged; Production untouched.

## What Discord shows

When a `/@<handle>` link is posted, Discord reads one `<script id="discord:component-embed" type="application/json">` from the page's first response and shows it in place of the Open Graph embed. Every other platform keeps the unchanged OG / Twitter tags (`public-handle-url`).

The layout is the approved Share Card lab design (`social-lab/worker.mjs`, `shareCard`), using real public data. It is styled as **Version A**, which Mazen approved as a visual design on 2026-10-26, from a three-way mockup comparison:
- the Container's accent bar is purple `#B14CFF`;
- a divider with large spacing (Separator `divider: true, spacing: 2`) sits between every pair of parts that are present;
- Gaming Roles and Location are Discord subtext (`-# `);
- the Intro title is a `###` heading;
- the footer line is bold.

These are all native Components V2 features; no image, border or background styling is used.

| Part | Content | Source |
|---|---|---|
| Header section | `## <display name>`, `@<handle> · **GAMID**` | `get_public_identity` |
| | `-# ` the first two Gaming Roles (primary first), then `+N more` as plain text | `get_public_identity` |
| | `-# 📍 <Location>` | `get_public_profile_extras` (null unless the owner shows it) |
| | thumbnail: the avatar tile | `social-card?handle=<handle>&variant=avatar` |
| ── Media gallery | the public Banner | `profile-banner/<handle>` (only when `has_banner`) |
| ── Text + media gallery | `### 🎮 My Gaming Intro` + the public Intro | `/@<handle>/intro-discord.webm?v=<digest>` when a share copy with the owner's chosen frame is ready; otherwise `/@<handle>/intro.webm` (same URL as `og:video`) |
| ── Footer section | `**Explore <name>'s GamID**` + one link button, **Open GamID** | the profile's own `/@<handle>` URL |

(── = a divider.)

### Dividers: B1 selected (2026-10-26)

Mazen chose **B1**, the static purple line, after live tests of both options; since `b110f07` the card uses it again. B2's GIF stays in `dist/assets` but is not used. Final acceptance of the card is still pending.

What the tests showed in Discord (desktop web, `@black?v=b1` and `?v=b2`):
- **Sizing:** each line renders full width at about 566 × 3.8 CSS px, with no letterbox, box or extra padding.
- **Behaviour:** a line is clickable and opens Discord's image viewer, and Discord gives it the alt text "Image".
- **B2 motion:** B2 animates, but it shows its first frame when GIF autoplay is off or Reduced Motion is on. Reduced Motion switches GIF playback off automatically.

### Divider live tests (B1 / B2)

Discord's native Separator has only `divider` and `spacing`; it has no colour, so it is always grey. To match the purple accent, each divider can instead be a one-item Media Gallery that shows a thin line image from this site's own assets. The image has no description, so Discord shows no ALT badge on it.

| Test | Image | Size |
|---|---|---|
| B1 | `dist/assets/discord-divider-purple.png`: a solid `#B14CFF` line | 1200 × 8 px |
| B2 | `dist/assets/discord-divider-gradient.gif`: the same line with a soft pink (`#FF5FD2`) glow sweeping across it, looping every 3 s | 1200 × 8 px |

- **Generator:** both images come from `scripts/generate-discord-dividers.ps1`, which uses ffmpeg.
- **Switch:** `DIVIDER_IMAGE_PATH` in `cf-worker/discord-card.mjs` names the image the card uses. It was B2 from `2d08e89` and is B1 again since `b110f07`. Its `?v=` tag changes whenever the image does.
- **Rollback:** without a `dividerUrl`, the card keeps Version A's native Separators (`divider: true, spacing: 2`). Rolling back means dropping `dividerUrl` in `cf-worker/worker.mjs`.
- **Component count:** each line replaces one Separator, so the count is unchanged (about 15 of Discord's 40). The payload grows by about 100 bytes per line.

Open GamID is the card's only link. `+N more` is not clickable.

**Missing values are never invented.** A part without a public value is left out: no Banner, Location hidden or empty, no roles, no Intro.

**Gender is not shown.** GamID has no gender field anywhere: no column, RPC or editor control. Showing it would need a new profile field with its own privacy rules. That is a separate product decision.

## Code

- **`cf-worker/discord-card.mjs`:** card builder, markdown escaping, payload cap, and the anonymous extras lookup.
- **`cf-worker/worker.mjs`:** for a well-formed handle, the identity and extras RPCs run together; `injectMetadata` adds the card's `<script>` block in the same head insertion. A null identity gets no card.
- **`supabase/functions/_shared/social-avatar.js` + `social-card/index.ts`:** the new `variant=avatar` mode of the existing `social-card` function.
  - It renders a 256 × 256 tile with the same identity check, avatar read, WebP conversion and letter fallback as the Identity Card.
  - The avatar's bytes still leave Storage only inside `social-card`; the Worker never fetches them (pinned by `tests/cf-identity-worker.test.js`).
- **Tests:** `tests/discord-share-card.test.js` and the updated call-count checks in `tests/cf-identity-worker.test.js`.

## Privacy and safety

- **Data source:** only what an anonymous visitor's browser already receives. An invalid, unknown, unpublished or PRIVATE handle gets no card and the same generic page as before.
- **User text:** shown literally.
  - Markdown, link, mention and URL punctuation is backslash-escaped.
  - Control characters and line breaks are collapsed.
  - The JSON is escaped so it cannot close its `<script>` element.
- **Payload:** no storage path, key or bio. It stays within Discord's 3,000-byte cap; the Location, then the Banner, are dropped first, and otherwise no card is sent.

## Limitations

- **Thumbnail-first:** live on TESTING since 2026-10-27 (`02c98c5`; Truth `intro-discord-thumbnail`, PENDING_ACCEPTANCE; see `docs/INTRO-DISCORD-THUMBNAIL.md`).
  - **With a chosen frame:** when the owner has chosen a frame and its share copy is ready, the card's Intro is `/@<handle>/intro-discord.webm?v=<digest>`, so Discord previews that frame.
  - **Otherwise:** the card plays the stored derivative, `/@<handle>/intro.webm`, from its own first frame.
  - **What does not change:** the layout, B1 and og:video.
- **Cloudflare terms (unchanged, still open):** the Intro reaches Discord through the existing `/@<handle>/intro.webm` Worker stream of Supabase-hosted video, the same path `og:video` has used since Phase 1. This card adds no new video path. Whether Cloudflare's CDN video terms cover it is still unresolved (REV-0028).
- **Caching:** Discord keeps a preview per page URL for a while. A change made after a link was first posted may only show when the link is posted again later.
- **Banner version:** the Banner URL carries the identity version tag, which doesn't include the Banner itself.
