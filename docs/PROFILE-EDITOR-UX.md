# Profile Editor independent sections (TESTING)

Current Desktop status: **ACCEPTED by Mazen 2026-10-15**, product `61de6220a37922a776cddd19771b10bdac4fde51`, deployed `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`; see PROFILE-EDITOR-PAIRED-ROWS.md and REV-0004. Older implementation and acceptance statements below are historical; no new Android real-device acceptance is claimed.

Historical baseline checkpoint: `8ce1616ce4024c0f875f97094dc516c8e62e41a1` on `feature/play-together-notifications`. Started from clean, pushed `6385515aa4f9627e5f6f295efeab07c39538fa44`; main remains `da2e020928f546e6b637f38629fd673b15544c2b`.

## Inventory and save boundaries

**Current Desktop layout/disclosure contract:** [PROFILE-EDITOR-PAIRED-ROWS.md](PROFILE-EDITOR-PAIRED-ROWS.md), checkpoint `61de622`, supersedes older independent-expansion Desktop descriptions below. At 1024px+ exactly one editor is open, with its original full-width panel below a paired summary row; switching keeps all drafts and never saves. About Me nested editors use the same single-selection behavior and retain independent saves. Smaller widths retain independent disclosures unchanged.

The smaller-width editor retains its 18 original owner sections. From 1024px, the authorized Desktop redesign groups About Me, Gaming Roles, Education & Work, Bio and Identity inside one About Me card; Identity is not duplicated. Other sections expand independently with meaningful visual summaries. Play Together is static on Desktop. My Games and Game Display are independent of Connections; League stays inside Connections. Hash/notification, failed-save and OAuth return destinations reveal ancestor panels. Desktop Save All is in the heading; smaller widths retain the original bottom placement. See [PROFILE-EDITOR-DESKTOP-REDESIGN.md](PROFILE-EDITOR-DESKTOP-REDESIGN.md), product `436de5e`, PENDING Mazen acceptance.

| Section | Existing controls / persistence |
|---|---|
| Avatar | Crop/apply stays local until this section's Save Changes; existing authenticated upload gateway and private avatar attachment |
| Identity | Display name only; permanent handle stays read-only; existing update_my_identity_profile |
| Bio | Bio only; existing update_my_identity_profile |
| Intro | Existing local-file validation/Preview, upload/queue/remove/transition APIs; own Save Changes; F2/F5 and processing untouched |
| Gaming Roles | Selected roles + primary role only; existing update_my_identity_profile |
| Education & Work | Status/institution/field only; existing profile RPC plus its own optional visibility setting |
| Preview Your GamID Classic | Compact action; full-screen saved Classic owner preview over Account; Back to Edit retains all drafts. No save/publication/Intro/Wall. See CLASSIC-PROFILE-OWNER-PREVIEW.md. |
| Share your GamID | Existing readonly link/QR, copy/share/download actions |
| Play Together | Existing navigation, not a settings save |
| My Wall | Existing navigation (Edit), not a Wall save. Since 2026-10-09 also the saved Wall state (Enabled / Disabled / Not published) and Disable My Wall / Enable My Wall with a confirmation: whether visitors see the published Wall or the Classic Profile (DEC-0003); the Wall content is never changed. |
| My Duo | Own visibility Save Changes; existing search/request/accept/remove confirmation actions remain explicit; staged visibility revalidates the current Duo before committing |
| My Crew | Existing create/search/invite/respond/open-Crew actions retain their server-authoritative submission controls; no invented Crew privacy setting |
| My Games | Existing canonical search/platform workflow; its editable platform panel has Save Changes; provider discovery/refresh remains an explicit action |
| Game Display | Own Save Changes for existing Games/playtime/stats visibility flags |
| League of Legends | Existing Riot-ID lookup form now labelled Save Changes; its existing public visibility has a separate section footer when a League profile exists; Refresh/Remove remain explicit actions |
| Connections | Own Save Changes for provider visibility; connect/disconnect/OAuth retain explicit existing actions. Since 2026-10-09 the Discord card also has Show Discord Profile Card, a separate opt-in (OFF by default, disabled while not connected, saved by the same Save Changes) for the visitor card behind the Discord icon in My Socials (DEC-0004) |
| My Socials | The owner's own accounts on 12 Wall platforms (Instagram, TikTok, YouTube, Twitch, Kick, X, Snapchat, Discord, Facebook; no Other): add / edit / remove as a draft; own Save Changes replaces the saved list (server-validated, all or nothing). Recognised, validated and rebuilt by the Wall's link engine (DEC-0002): account kinds only (profile, channel, page, Discord profile or invite). Replaced the old IDENTITY BOARD · FUTURE placeholder (2026-10-09). |
| ⋯ menu (no section) | Signed-in email, Language (applied when chosen, no save button) and the existing confirmed Sign Out. The standalone Account Settings section was removed on 2026-10-09. |

Readonly/navigation sections do not get dummy saves. Relationship and lookup actions retain their established intentional submission/confirmation semantics; Save Changes never sends an invitation, joins a Crew, starts OAuth, refreshes external data, publishes a GamID or saves a Wall.

## Profile Editor completion (2026-10-09)

Product checkpoint `9e11076bb1ea19eb09e911030ad1dcc6cdd09150` (`97853c4` + desktop row layout fix); PENDING_ACCEPTANCE. Authorized by Mazen (Product Memory DEC-0001, from the notes in DIS-0003).

- **PROFILE INFORMATION** label above Avatar, Intro, Identity, Bio, Gaming Roles and Education & Work; every existing section and field is kept.
- **My Socials**: see the table. Public display: the saved links of a published GamID lead the public profile panel as labelled icon links (44 px targets, new tab, no referrer), also without a Wall; a published Wall still replaces the whole profile body. Data: migration `20261009120000_my_socials` (`social_platform_catalog`, `identity_social_links`; RLS on, no table privileges; `get_my_social_links` / `set_my_social_links` for the caller's own SOLO GamID; anonymous `get_public_social_links` gated on `visibility = 'PUBLIC'`). The browser catalog in `dist/account/socials.js` must stay identical to the migration (tested).
- **Save All Changes** at the end of the editor: saves every section whose Save Changes is enabled, one after another through that section's own save path (same validation, progress, errors). Unchanged sections are not sent; a running Save All cannot start again. On any failure the summary names the sections that did not save (their drafts stay, the first is opened) and those that did; no overall success is shown. Workflow drafts (My Games entries, League lookup) keep their own buttons and are mentioned in the summary.
- **Account Settings** moved to the ⋯ menu (see the table).

## Implementation and safety

`dist/account/profile-editor.js` owns reusable section layout, field ownership and the serialized save queue. The existing whole-profile RPC remains unchanged: immediately before a profile write, Account reads the current authenticated profile, verifies owner/session/entity, merges only the selected section fields and applies existing validation. Different profile saves serialize; duplicate saves for one section coalesce. No second backend, schema, storage, RLS, authentication or publishing system.

Only the saving panel is disabled. Other section values, pending cropped Avatar and pending Intro survive another section's save. Server-normalized values are copied back only into the saved section. Visibility switches are staged by unique section/setting until its Save Changes; a failed setting stays retryable. A multi-setting section uses the existing separate RPCs, so partial server success is retained and remaining failed settings remain dirty (no promise of a new transactional multi-RPC backend).

Collapse and resizing do not recreate fields. Dirty profile/media/settings/language and workflow drafts guard links, OAuth departure, sign out and browser unload. Existing lookup/request modules retain their draft state and validation. Intro background refresh skips an unsaved transition; local previews, owned sources and the accepted streaming engine are unchanged. An account switch during the fresh baseline read aborts before the profile mutation.

Initial section implementation: `5adcac4eaf8a4076e59fed1ed508bcc258cc1034`; initial single-timer correction: `96ee33c054253f426c394348fb8ae205c697185f`. Final lifecycle correction disposes replaced controllers (timer, Intersection/Mutation observers and visibility listener), ignores their stale show/hide/timeout callbacks, hides feedback at sign-out and clears old feedback/field errors when the owner editor is restored. Section/language save outcomes carry both current owner/entity checks and an editor lifecycle generation, so neither account switching nor same-account sign-out/re-sign-in can report an old result into the reused UI. Explicitly transient errors use the five-second clock; actionable/field errors remain persistent.

Profile-only feedback uses the existing transient-message helper with five seconds of actual visibility. Collapse, offscreen scrolling and background tabs pause the remaining clock; a new message starts five seconds anew. Progress persists while running; actionable errors (e.g. a network failure) persist. Field errors remain inline until the relevant draft changes to a valid value; the matching notification below Save Changes is transient (five visible seconds) and clears at once when the field becomes valid. Status announcements are local and accessible. Existing three-second helper defaults outside this editor remain unchanged; the global notification center/data/subscriptions are unchanged.

## Verification

- Final focused lifecycle/profile/shell/identity/Duo regression checks: 74/74 PASS, including 19 Profile Editor checks. Lint, typecheck, voice typecheck and diff whitespace validation PASS.
- Previously completed full suite at 96ee33c: 1,688 tests, 1,687 PASS, one existing opt-in skip, zero failures. The final deployment workflow also ran the required complete build; no unnecessary local full-suite repeat.
- `scripts/profile-editor-browser.mjs`: reproducible opt-in Playwright/installed Chrome harness. All HTTP Supabase traffic and WebSockets are intercepted; fixture session/records are in isolated browser contexts. No disposable Supabase accounts or real user/media writes.
- Final local and deployed-frontend desktop Chrome at 1280 and narrow Chrome at 390: all 17 panels toggle; multiple panels remain open; isolated Name/Bio/Roles/Education/Avatar saves, pending Avatar preservation, Intro transition, Game Display failure/retry, Duo visibility, language, duplicate/concurrent saves, persistent errors/field correction, five visible seconds with collapse, resize/draft preservation, navigation rejection, sign-out/re-sign-in cleanup and new five-second clock, stale account-switch outcome suppression, a delayed save across same-account re-sign-in, session switch protection, notification destinations and bell; no page errors or horizontal overflow.
- This is NOT Android real-device/emulator acceptance. Mazen must test Android Chrome. The browser fixture proves client contracts against mocked authoritative responses, not a new live backend/media-processing test.

## Deployment and continuation

Cloudflare TESTING workflow run [37862526301](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37862526301) SUCCESS from exact product `8ce1616ce4024c0f875f97094dc516c8e62e41a1`. Account HTML (version stamp `8ce1616`) and all six changed frontend modules/styles match the committed sources byte-for-byte after normal workflow stamping. Root, Account, Play Together, Wall Editor and public-handle routes return HTTP 200. Final deployed browser fixture passes at desktop/narrow widths with mocked backend traffic only. No worker, migration or authentication configuration deployment.

Stop for Mazen's manual acceptance. Separately, the prior Intro duration-boundary Android retest remains PENDING (`docs/INTRO-DURATION-TOLERANCE.md`, handoff §19); do not conflate it with this task or redo its worker/migration/fixtures.

## Files changed

Initial refactor: `dist/account/account.css`, `dist/account/account.js`, `dist/account/manual-games.js`, `dist/account/my-duo.js`, new `dist/account/profile-editor.js`, `dist/account/transient-message.js`, `package.json`, new `scripts/profile-editor-browser.mjs`, new `tests/profile-editor.test.js`, and adjusted `tests/league-ui.test.js`, `tests/slice-3a-identity.test.js`, `tests/slice-3b-roles-education.test.js`, `tests/slice-3c-intro-identity.test.js`.

Final lifecycle continuation: `dist/account/account.js`, `dist/account/transient-message.js`, `tests/profile-editor.test.js` and `scripts/profile-editor-browser.mjs` only. Continuation/state: this record, `PROJECT_STATE.md`, `PROJECT_HANDOFF.md` and `gamid-truth.json`.

## Manual acceptance

1. Open Cloudflare TESTING `/account/` signed in, on desktop and Android Chrome. Check all applicable section headings/summary/icons; expand several, collapse each and verify no horizontal overflow.
2. Change Name and Bio; save Name only. Bio must retain its unsaved text. Save Bio, reload and verify both persisted. Repeat isolation with Roles and Education.
3. Stage a cropped Avatar or local Intro; save an unrelated text section. Pending media and Preview must remain intact; only its own Save Changes commits it. Check Intro transition, local Preview, close/replay and normal ending using normal TESTING acceptance media (no need to reprocess existing assets).
4. Toggle an available visibility setting: public data should not change until the relevant Save Changes. Toggle back before save and verify no change remains. Check Game Display, Connections, Education and My Duo where configured. Check language independently.
5. Check section save progress/duplicate-click blocking, local success for five visible seconds, collapse/reopen timing, field validation and retry after an actionable failure. Other drafts must survive errors and resizing.
6. With an unsaved draft, try My Wall/Play Together navigation, OAuth connect or Sign out and cancel the discard prompt. Stay in the editor with the draft intact.
7. Save a section, sign out, then sign in again. No former success/error or field error should reappear. A fresh save must remain visible for five visible seconds, including after collapse/reopen; repeat an account switch during a pending save if convenient.
8. Check the global notification bell/log and My Duo/My Crew notification destination, plus existing Crew/Duo actions. Existing public GamID/Wall presentation should remain unchanged.

No Production, main merge, Monitor, database migration, worker deployment or real user test mutation in this task.
## Desktop manual acceptance (2026-10-11)

- Mazen ran 16 desktop manual tests on TESTING (`a1d2eeb`) and all PASSED. He explicitly accepted the tested desktop functionality (Product Memory REV-0004).
- Test 11 (pending Avatar draft preservation) passed, but its visual preview was not conclusively verified.
- **Android Chrome real-device acceptance is still outstanding** (checklist item 1 above), so the capability remains PENDING_ACCEPTANCE in GamID Truth.
- An Intro Preview Skip destination problem seen during test 15 is tracked separately as ISS-0010 (OPEN, needs investigation).
## Intro Preview returns to the editor (ISS-0010, 2026-10-11)

Product `7373607`, TESTING run 38148668016.
- **Behaviour:** Preview Intro plays the Intro. Skip Intro, and the natural end after its transition, both close the preview through the existing Return to editor path (`stopIntroPreview()` + `dialog.close()`), so focus goes back to Preview Intro and every draft is kept.
- **How:** the editor asks the frame for `hostReveal`, so the frame's old built-in profile card (`DRAFT · PRIVATE`) is never shown. `dist/account/intro-preview-host.js` (`createEditorPreviewEnd`) reacts only to a preview that actually started, and only to the editor's own frame.
- **Unchanged:** the public visitor Intro, the frame, transitions and controls. This fix is PENDING Mazen's manual acceptance.

## Saved Classic owner preview (2026-10-14)

The former Live Preview accordion is replaced by the compact Preview Your GamID Classic action (product `41aa906`, PENDING owner acceptance). It opens the actual Classic renderer above Account; Back to Edit preserves every draft including pending Avatar and Intro selections. Saved section visibility still applies, while Wall and Intro are bypassed. The former card's GamID publication controls remain in an independent row; Share your GamID and My Wall retain their workflows. Full implementation, validation and deployment record: [CLASSIC-PROFILE-OWNER-PREVIEW.md](CLASSIC-PROFILE-OWNER-PREVIEW.md).

Desktop media / independent card flow follow-up: [PROFILE-EDITOR-MEDIA-REVIEW.md](PROFILE-EDITOR-MEDIA-REVIEW.md), checkpoint `0dd59a91b947571d5579c8ed61be5c94cb9dffc0`, PENDING Mazen review. Smaller widths and save/workflow contracts remain unchanged.

Adaptive Desktop architecture (2026-10-15): [PROFILE-EDITOR-ADAPTIVE-LAYOUT.md](PROFILE-EDITOR-ADAPTIVE-LAYOUT.md), product `e18c695ef5194d0448472da0b434a9fd1097dcdb`, PENDING Mazen review. All main cards use natural column flow and card-width responsive controls; mobile, saves and privacy unchanged.
