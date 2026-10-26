# Discord share card (Components V2)

Status: on TESTING for Mazen's visual review, PENDING_ACCEPTANCE (GamID Truth `discord-share-card`). Implemented under Mazen's task of 2026-10-26, "GamID Discord Components V2: Implement & Deploy to TESTING". Not merged; Production untouched.

## What Discord shows

When a `/@<handle>` link is posted, Discord reads one `<script id="discord:component-embed" type="application/json">` from the page's first response and shows it in place of the Open Graph embed. Every other platform keeps the unchanged OG / Twitter tags (`public-handle-url`).

The layout is the approved Share Card lab design (`social-lab/worker.mjs`, `shareCard`), using real public data:

| Part | Content | Source |
|---|---|---|
| Header section | `## <display name>`, `@<handle> · GAMID` | `get_public_identity` |
| | the first two Gaming Roles (primary first), then `+N more` as plain text | `get_public_identity` |
| | `📍 <Location>` | `get_public_profile_extras` (null unless the owner shows it) |
| | thumbnail: the avatar tile | `social-card?handle=<handle>&variant=avatar` |
| Media gallery | the public Banner | `profile-banner/<handle>` (only when `has_banner`) |
| Text + media gallery | "My Gaming Intro" + the public Intro | `/@<handle>/intro.webm` (same URL as `og:video`) |
| Separator, footer section | "Explore <name>'s GamID" + one link button, **Open GamID** | the profile's own `/@<handle>` URL |

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

- **Thumbnail-first:** not available. The card plays the stored Intro derivative, so Discord's preview frame is the Intro's own first frame. A thumbnail-first share copy needs new Intro processing (the Cloud Run worker image), storage and a decision on which frame. None of that was authorized.
- **Cloudflare terms (unchanged, still open):** the Intro reaches Discord through the existing `/@<handle>/intro.webm` Worker stream of Supabase-hosted video, the same path `og:video` has used since Phase 1. This card adds no new video path. Whether Cloudflare's CDN video terms cover it is still unresolved (REV-0028).
- **Caching:** Discord keeps a preview per page URL for a while. A change made after a link was first posted may only show when the link is posted again later.
- **Banner version:** the Banner URL carries the identity version tag, which doesn't include the Banner itself.
