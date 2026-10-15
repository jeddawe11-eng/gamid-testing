# Desktop sidebar and Crew presentation follow-up (TESTING)

Product checkpoint `35842e9e44cab1adc82c57a50f506916405f8d76`, branch `feature/play-together-notifications`, from verified clean GitHub/local `56c5667c004fdc2b6a29a573ead71fb4bf7cb843`. Starting TESTING source `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`. Mazen explicitly authorized implementation, tests and TESTING-only deployment of three targeted presentation improvements. **These new improvements are PENDING Mazen visual review, not ACCEPTED.** Prior Desktop acceptance (IDEA-0001 / REV-0004) and Public Profile acceptance remain intact.

## Layout

The centered Desktop shell has a sensible 2000px maximum. Its actual sidebar track grows from 208px through 336px at 1440 to 488px on wide Desktop (1920), twice the previous 244px wide-screen sidebar. From 1024 to 1279 it stays 208px; at 1280 it remains 208px rather than consuming the editing workspace. The preferred track is `clamp(208px, calc(100vw - 1104px), 488px)`. No browser zoom, CSS zoom, scale or transform simulates the result. Existing fonts/icons/buttons are not enlarged; the saved Classic card uses the real additional width.

Two equal editing columns, original full-width expanded details below their paired row and single-open disclosure behavior remain unchanged. Wider viewports gain a wider workspace; narrower Desktop prioritizes comfortable editing width instead of forcing a doubled sidebar. Below 1024 all new CSS remains inactive and original DOM restoration is retained.

## Crew summaries

The actual public MY CREWS `crewCard` renderer from `public/crews-directory.js` is reused in Desktop summaries. Styling of its artwork, dark gradient, game icon, name/game/member count and small member faces is scoped to `.desktop-crew-tile`; public files and public layout are unchanged. Up to two existing summary entries remain, with the existing count for additional Crews. Inner tiles use available width naturally and stack when narrow.

`my-crew.js` adds only a presentation `data-game-key` attribute to existing live Crew cards. The Desktop adapter reads those existing loaded cards and their member rows; avatar images reuse only Blob URLs already supplied by the existing public-avatar loader. No new member fetch, permission, provider service, upload, save, publication or business logic is added. Existing navigation URLs are reused and the existing unsaved-navigation confirmation remains effective.

Crew artwork uses the existing caller-scoped game-artwork read, which already contains eligible public Crew game targets. Its refresh signature includes Crew keys and it can run when Crews exist without My Games. `applyGameArtwork` uses the same canonical game key, approved CDN URLs and hero/grid preference as the public modal. Unavailable or ineligible art keeps the existing gradient/initial fallback; broken image URLs retain the editor's no-retry-loop guard. Owner changes and Desktop teardown retain their existing invalidation paths. No backend or infrastructure changes.

## Validation

- Full `npm run build`: syntax/type checks PASS; 1910 tests, 1909 PASS, one existing opt-in SKIP, zero failures.
- `classic-preview-browser.mjs --final-layout`: 12 empty/populated/rich cases at 1024/1280/1440/1920, Zoom 100%. Sidebar dimensions, centering, workspace width, equal columns, full-width details, no Desktop overflow, independent panel growth and original-node drafts PASS. Populated cases check distinct League/Marvel canonical backgrounds and member avatars. Crew navigation at 1440 reaches the existing Crew route after explicit fixture confirmation and returns successfully.
- Existing functional browser suite: 1024/1440 saves, Save All and partial retry, notifications, Banner crop/save, Avatar/Intro drafts and Classic return; full existing 390px mobile workflow PASS.
- Media suite: 1024/1440/1920/390 real Intro frame, connection images, game art, failed-image fallback and no autoplay PASS. Classic suite: 1440/390 saved data, Wall states, no Intro/write, media drafts and unauthorized refusal PASS.
- Before/after screenshots at 1440/1920 use the same isolated fixture and real rendering. Controlled fixture images stand in for provider images; no protected account or real data is changed.
- Mobile 390/768 screenshots are byte-identical to the starting frontend. **Existing 768px limitation:** document scroll width is 848px before and after (80px overflow); it is not introduced or changed by this Desktop task. The comparison mode explicitly reports this measurement rather than treating it as no-overflow. 390px has none. No mobile redesign is included.

## Governance

GamID Truth: NO CHANGE REQUIRED — cosmetic owner presentation only; no capability, approved behavioral contract or authoritative limit changes. The accepted material behavior checkpoint remains `61de622`; this presentation checkpoint is tracked here and in PROJECT_HANDOFF §64 while awaiting review. Product Memory: PROPOSED only — update existing IDEA-0001 / REV-0004 after separate owner save approval; no records changed now. The existing 768px limitation is a separate potential issue-record candidate, not stored in Truth. TESTING-only frontend deployment follows validation; no Production, main merge or unrelated work.

TESTING delivery: source `ff5fff9d6a1e7ba609822243a3e7efe4cc632174`, [workflow 38736570261](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38736570261) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Eleven served frontend files verified exact, including changed my-crew.js, Desktop JS/CSS and the reused public Crew renderer. Deployed isolated fixture reruns PASS: 12 layout cases at 1024/1280/1440/1920, functional 1024/1440/390, media 1024/1440/1920/390 and Classic 1440/390. All backend writes intercepted; no real account mutation. Governance validation 37/37 PASS; Product Memory 32 existing records PASS and unchanged. Final delivery documentation does not change deployed dist. **STOP for Mazen visual review; these presentation improvements remain PENDING acceptance.**
