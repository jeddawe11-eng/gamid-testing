# Desktop Profile Editor media review (TESTING)

Product checkpoint `0dd59a91b947571d5579c8ed61be5c94cb9dffc0`, branch `feature/play-together-notifications`, resumed from verified clean GitHub/local `c4116efcc216a8c9d574821859b1bd8112dca6f9`. Mazen authorized all four visual-review fixes and TESTING deployment. **PENDING Mazen review and acceptance.**

## Reproduction and implementation

The deployed frontend was reproduced using an isolated PRIVATE owner fixture with an existing READY Intro, stored Steam avatar, League profile-icon ID, two canonical games and disabled/unpublished Wall. Backend calls were intercepted; no real account or object was modified.

1. Intro summaries used an intentional placeholder and had no saved-frame capture. Desktop now seeks a detached, paused video to a real frame, produces an in-memory JPEG (maximum 640×360), and displays it in both collapsed and expanded Intro. Saved videos reuse the existing owner source resolver / 120-second signed lease; local selections use the existing local URL. It never calls play, starts a transition, uploads a poster or saves/publishes. Abort/timeouts, stale-owner checks and Blob cleanup cover replacement, removal, resize, sign-out and page teardown. Unsupported/refused media shows “Thumbnail unavailable”; Preview Intro remains independent.
2. The original provider image guard accepted Discord only. Desktop now permits stored Steam avatar URLs on the established Steam CDN hosts and maps the existing integer League profile-icon ID to the existing prototype source's static asset family. No provider refresh, OAuth change, fabricated icon ID, Riot API or verification claim is added. League stays PROTOTYPE / UNVERIFIED. Private information stays in Account; Classic opt-ins are unchanged. Missing/broken images fall back to initials with bounded failure handling.
3. Grid stretching / forced heights made My Socials grow when Connections opened. Natural heights plus independent community column stacks keep card heights and the other column's subsequent positions unchanged. Avatar/Intro also retain independent heights; full-width sections retain their content flow. No overlap or clipped content is used to hide expansion.
4. My Games never requested the existing artwork metadata used by Classic. Desktop now associates the original tiles with canonical keys and calls the existing artwork function's authenticated owner read. Saved Classic owner preview uses the same source and shared image renderer, including PRIVATE/unpublished profiles. Existing public owner targets (including Crew/League-only artwork) are retained. Ordinary visitor Classic and Crew routes preserve public gates. See GAME-ARTWORK-STEAMGRIDDB.md for caller authorization, catalog filtering and unchanged limits.

All form controls and section save handlers remain original. Mobile below 1024px restores original DOM/images. Save All, per-section saves, immediate actions, drafts, Avatar/Banner upload/crop, independent Intro Preview, Wall and public profile behavior are preserved.

## Validation

- Full `npm run build`: 1910 tests, 1909 PASS, one existing opt-in SKIP, zero failures; includes lint/syntax, Truth, Product Memory, account/Intro/Wall/privacy and artwork regressions.
- Eight media tests: source validation, saved/local capture lifecycle, cancelled owner capture, failure fallback, authenticated derived artwork targets, anonymous/expired refusal, TESTING kill switch and retained public Crew art without private-library contamination.
- `classic-preview-browser.mjs --media-review`: 1024 / 1440 / 1920 / 390. Real decoded video frame, stored Steam and League images, game image loads, shared Editor/Preview URLs, independent heights and column flow, no overlaps/overflow/playback/mutations, resize restoration and broken-media fallback. This mode's CDN fixture images are neutral test pictures; no protected account data is seeded.
- Account mobile screenshots at 390 and 1023 are byte-identical to archived `c4116ef`.
- `classic-preview-browser.mjs`: 1440 / 390, saved sections, three Wall states, Avatar and Intro drafts across Back to Edit, no mutations or Intro requests by the Classic iframe, unauthorized refusal, ordinary public Classic pixel equality against `c4116ef`, preserved visitor Wall behavior.
- `profile-editor-browser.mjs`: 1024 / 1280 / 390, independent saves / Save All / partial failure / retry, staged visibility, Socials, About Me, keyboard roles, Avatar/Banner validation/crop/upload, Intro settings, Wall confirmation, sign-out / stale saves / owner switch and draft-preserving resize.

Browser checks use isolated fixtures and intercepted backend calls. They do not claim authenticated real-account end-to-end validation, Android-device testing or owner acceptance. Live deployment checks are recorded after deployment.

## Limits and governance

Stored Steam rows without an avatar URL retain initials until the existing explicit connection refresh supplies one; this task does not silently call providers. Invalid/missing League IDs and unavailable CDN images retain fallback. Browser codec/CORS/network failures can prevent a video frame, with explicit status. Posters are regenerated in memory; no background thumbnail service or persisted poster is introduced. Artwork remains provisional TESTING-only, subject to exact matching, the existing lookup budget / switch, and its outstanding distribution permission; unmatched games keep initials.

GamID Truth: UPDATED — Desktop owner media contract and authenticated canonical owner artwork read / surfaces / checkpoints, with existing statuses and limits unchanged. Layout reflects independent card flow.

Product Memory: PROPOSED — an IDEA-0001 follow-up issue/review recording Mazen's four findings, their presentation-only resolutions and safe missing-media fallbacks. No Product Memory file/Register is saved; separate explicit approval is required.

No Production access, main merge, infrastructure/schema migration, protected-identity mutation or new processing service. Deploy the existing game-artwork function to the confirmed TESTING project only, then the exact-commit existing Cloudflare TESTING workflow. STOP for Mazen review.
