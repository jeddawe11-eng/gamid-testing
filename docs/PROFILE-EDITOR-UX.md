# Profile Editor independent sections (TESTING)

Status: PENDING_ACCEPTANCE. Product checkpoint: `8ce1616ce4024c0f875f97094dc516c8e62e41a1` on `feature/play-together-notifications`. Started from clean, pushed `6385515aa4f9627e5f6f295efeab07c39538fa44`; main remains `da2e020928f546e6b637f38629fd673b15544c2b`.

## Inventory and save boundaries

All 17 existing owner sections are independently expandable, initially compact, with a title, icon and summary. Opening one does not close another. Nested My Games / Game Display / League retain their Connections parent; hash/notification and OAuth return destinations reveal the appropriate collapsed panels.

| Section | Existing controls / persistence |
|---|---|
| Avatar | Crop/apply stays local until this section's Save Changes; existing authenticated upload gateway and private avatar attachment |
| Identity | Display name only; permanent handle stays read-only; existing update_my_identity_profile |
| Bio | Bio only; existing update_my_identity_profile |
| Intro | Existing local-file validation/Preview, upload/queue/remove/transition APIs; own Save Changes; F2/F5 and processing untouched |
| Gaming Roles | Selected roles + primary role only; existing update_my_identity_profile |
| Education & Work | Status/institution/field only; existing profile RPC plus its own optional visibility setting |
| Live Preview | Read-only current draft; compact and collapsible |
| Share your GamID | Existing readonly link/QR, copy/share/download actions |
| Play Together | Existing navigation, not a settings save |
| My Wall | Existing navigation, not a Wall save |
| My Duo | Own visibility Save Changes; existing search/request/accept/remove confirmation actions remain explicit; staged visibility revalidates the current Duo before committing |
| My Crew | Existing create/search/invite/respond/open-Crew actions retain their server-authoritative submission controls; no invented Crew privacy setting |
| My Games | Existing canonical search/platform workflow; its editable platform panel has Save Changes; provider discovery/refresh remains an explicit action |
| Game Display | Own Save Changes for existing Games/playtime/stats visibility flags |
| League of Legends | Existing Riot-ID lookup form now labelled Save Changes; its existing public visibility has a separate section footer when a League profile exists; Refresh/Remove remain explicit actions |
| Connections | Own Save Changes for provider visibility; connect/disconnect/OAuth retain explicit existing actions |
| Account Settings | Own Save Changes for language; existing confirmed Sign out |

Readonly/navigation sections do not get dummy saves. Relationship and lookup actions retain their established intentional submission/confirmation semantics; Save Changes never sends an invitation, joins a Crew, starts OAuth, refreshes external data, publishes a GamID or saves a Wall.

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
