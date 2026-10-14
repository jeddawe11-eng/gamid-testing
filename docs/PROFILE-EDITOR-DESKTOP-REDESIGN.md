# Desktop Profile Editor redesign (TESTING)

Product checkpoint: `4f980a4d23b88ee27e80afd27ad644a96be24088`, branch `feature/play-together-notifications`, from verified GitHub / clean local `99874cf8a560a00faa16eb9a924a3bde1e9faed9`. Mazen explicitly authorized implementation and TESTING deployment after review and eight resolved decisions. **PENDING Mazen review and acceptance.**

## Layout

Desktop starts at **1024 CSS pixels**. `desktop-editor.js` moves the existing live section cards and save controls into a wide layout and records original-position slots to restore them below 1024px. `desktop-editor.css` is a media-qualified stylesheet. No alternate app or backend exists. Authentication / onboarding are unchanged.

- Sidebar: YOUR GAMID, saved Classic Preview, publication, Share, My Wall and saved profile summary (name, handle, Avatar, bio, opted-in Location and saved Socials). No drafts are shown in this saved summary; Classic Preview remains the actual existing renderer above Account.
- Editing area: heading / Save All; paired Avatar and Intro; full-width Banner; full-width About Me; Socials / Connections; My Games / Game Display; My Duo / My Crew; static Play Together navigation. The owner's final authorization allows this ordering.
- About Me contains exactly five independently expandable sections: About Me (Location, Languages, Favorite Genres), Gaming Roles, Education & Work, Bio, Identity. Fields occur once, inside this group. Original per-section saves remain; no group save is invented. Failed Save All and notification destinations reveal ancestor panels.
- Collapsed summaries show real Avatar, Banner, Intro state / transition, 12 Socials with Added / Not added, connection names / states, available game icons / fallback initials / counts, display flags, current Duo / actual badge and Crew names / games / member counts. Empty / loading / error states stay explicit. Reference account data, durations, art, verification or relationships are never seeded.
- CSS grid stretches paired outer cards to the taller card with automatic content height; images retain aspect ratio. Avatar is never mirrored. Banner remains 1920x320 (6:1). Sidebar proportions and spacing adapt from 1024px upward.

## Preservation

Original controls are moved, never reconstructed. Form-associated controls retain `form=profileForm` on Desktop; original attributes, ancestry and icons are restored below 1024px. The draft guard still distinguishes profile fields from workflow forms. Avatar Blob / crop and Intro selection remain owned by the existing lifecycle.

Save Changes / Save All retain callbacks, validation, serialization, feedback, retries and owner guards. Saved sidebar data does not become a draft preview. Visibility remains staged where previously staged. Favorites, game edits, invitations, relationships, connect / disconnect, Wall and publication retain their existing explicit action boundaries. All 71 roles / eight categories, Primary Role, suggestion / authorized review, 12 Socials, four favorites, Duo / Crew states and limits, game provenance / details, Discord opt-in, Steam discovery and League prototype labels remain.

No schema, API, Auth / RLS, Storage policy, quota, Worker processing, infrastructure or Production change. No merge or protected identity mutation. Browser backend traffic is intercepted fixtures. No Product Memory edit.

## Deliberate reference differences

The detailed images govern styling and summary / expanded structure; current functions and Truth govern behavior. No Avatar Remove / Rotate / Library, Intro template service, current-location detection, editable handle, Other social link or per-Social visibility switch is added. Socials are added links, not OAuth. Missing artwork uses real icons / initials. Saved Intro has no persisted poster: its collapsed card shows actual state / transition and existing Preview, without fetching video media on entry. A selected Intro can show its existing local video. Avatar crop remains the functional modal, not a simulated inline tool. Banner keeps real drag / keyboard / zoom / cancel controls; unsupported View Full or reference illustrations are not invented.

## Validation

- `npm run build`: 1902 tests, 1901 PASS, one existing opt-in SKIP, zero failures, plus lint / syntax / voice checks. Windows local-loopback fixture tests require execution outside the network sandbox; no paid Cloud Run job or real account is invoked.
- `scripts/profile-editor-browser.mjs`: 1024 / 1280 / 390, independent saves, Save All / partial failure / offline retry, visibility, Socials, Banner upload / crop / remove, About Me catalogs, Avatar crop / validation / retry, Intro settings / processing, Wall confirmation, notifications, sign-out, stale saves / account switch and resize drafts. No page errors / overflow.
- `GAMID_LAYOUT_ONLY=1`: 1024 / 1280 / 1440 / 1920 / 390, initial collapsed state, five nested sections / one Identity, original form ownership, closed / expanded paired geometry, static Play Together, no writes on opening / typing / resizing, unchanged saved sidebar with drafts, multiple inner sections and expanded content without overflow. Screenshots inspected.
- Account baseline screenshots from archived `99874cf` are byte-identical at **390 and 1023px**. This does not claim real Android-device or owner acceptance.
- `scripts/classic-preview-browser.mjs`: 1440 / 390, private saved owner without edits, three Wall states, saved Classic sections, cropped Avatar / valid local Intro drafts, Back to Edit, no writes / Intro, unauthorized refusal, ordinary public Classic pixel equality against `99874cf` and visitor Wall behavior. Populated Desktop summaries are asserted.

Set `GAMID_BROWSER_MODULE`, `GAMID_CHROME_PATH`, `GAMID_BROWSER_OUTPUT` for installed Playwright / Chrome. `GAMID_LAYOUT_WIDTHS` selects layout widths; `GAMID_FIXTURE_ROOT` selects a baseline dist tree; `GAMID_BASELINE_ROOT` selects the public Classic baseline. `--live` tests deployed TESTING frontend with the same intercepted backend.

## Governance and deployment

GamID Truth: UPDATED — your-gamid-editor records the 1024px Desktop layout, five inner About Me sections / single Identity, static Desktop Play Together, unchanged mobile / workflows and relocated Desktop Save All. Status and limits unchanged.

Product Memory: PROPOSED — update IDEA-0001 or add a decision for the authorized Desktop redesign and its 1024px / grouping / persistence boundaries. No record / Register saved; separate memory-save approval required.

Deploy only through the existing exact-ref / expected-SHA Cloudflare TESTING workflow after validation. Record the result here, then STOP for Mazen review.
