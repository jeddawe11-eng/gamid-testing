# Adaptive Desktop Profile Editor (TESTING)

Product `e18c695ef5194d0448472da0b434a9fd1097dcdb`, branch `feature/play-together-notifications`, resumed from verified clean GitHub/local `155e845340ff7c58f91600aa52487424d4473b49`. Mazen authorized reviewing and improving the whole Desktop layout, compacting Intro, moving Duo above Crew in the right column, regression testing and TESTING-only deployment. **PENDING Mazen visual review; not ACCEPTED.**

## Architecture

The previous page combined shared outer rows (Avatar/Intro, then full-width Banner/About Me) and separate community stacks. Changing one early card still moved both columns, media could dominate its card and summaries had inconsistent sizing rules.

Every main card now follows one explicit `columnPlan` in `desktop-editor.js`:

| Left column | Right column |
| --- | --- |
| Avatar | Your Intro |
| Banner | Connections |
| About Me (five original inner sections) | My Socials |
| My Games | My Duo |
| Game Display | My Crew |
| Play Together | |

This table names each column's order, not synchronized rows. Both columns align at the top; each then flows naturally. Duo is directly above Crew on the right. Related games/settings and connections/socials stay together. No measured-height synchronization, absolute card positioning, shared-height rows, forced equal heights, clipping of expanded forms or card movement between columns is used. Expanding a card changes only subsequent positions in its own column, so focus/context remains predictable. One responsive gap token governs each stack; original fields, save controls and mobile restoration slots remain unique.

Cards have definite available inline width, `min-width:0` and intrinsic block height. Card-width container queries adapt Location, social actions, connection actions and switches, rather than assuming a desktop viewport guarantees a wide form. Text wraps, control widths are bounded and summary tiles auto-fit as icons/items vary. Adding a top-level section requires registering it in the column plan; existing content primitives then handle wrapping and growth.

Collapsed summaries use two-line text with full text retained in the DOM and native titles; expanded sections retain all fields/text/actions. Crew summaries show three actual Crews plus an actual total and “Open to see all” when needed; all existing Crews remain in the expanded panel. Games keep their existing five-item summary and total/favorites count. No product limit changes. Intro keeps its real captured frame in a bounded 220×110 presentation viewport, preserving source aspect ratio with contain; Avatar is 96px. Empty/loading media uses the same compact footprint. Typical collapsed Avatar/Intro heights differ by about 9px across the tested widths; neither depends on the other's height. Saved sidebar decoration and Share/Wall spacing are reduced without removing their content/actions.

At 1024–1279 the sidebar is 200px with smaller shared spacing; wider Desktop uses 224px. This leaves usable content columns while preserving the sidebar hierarchy and keeping editing at the top of the page. All CSS remains inside min-width:1024px. Below that breakpoint, Desktop wrappers/icons/photos are removed and the original DOM, controls, fields and drafts are restored. No mobile stylesheet was edited.

## Validation

- Full `npm run build`: 1910 tests, 1909 PASS, one existing opt-in SKIP, zero failures; lint/syntax/Truth/Memory validation included.
- `classic-preview-browser.mjs --adaptive-layout`: 18 cases (1024, 1152, 1280, 1440, 1920, 2560 × empty/populated/rich). Rich includes 14 games, 10 Crews with 15 member rows, 12 Socials, long/unbroken provider/game/relationship text and square/portrait/wide source images.
- Each case checks usable full card widths, no card/control overflow or overlap, consistent gaps, compact Avatar/Intro, exact Duo/Crew ordering, and ten independently expanded/growing cards with extra long text and 15 extra icons. Opposite-column positions/heights must remain identical. Then all sections/nested editors open together; controls remain inside their cards. Resize across Desktop and mobile preserves the identical original draft node/value. No save/publication/playback is triggered.
- Existing functional editor regression: independent saves / Save All / partial errors / retry, feedback, keyboard roles, Avatar/Banner upload/crop, About Me/Socials, Intro, Wall, notifications, sign-out and stale-owner guards at 1024 / 1280 / 390.
- Ordinary Classic/public preview regression at 1440 / 390: saved content, three Wall states, Avatar/Intro drafts and Back to Edit, unauthorized refusal, preserved visitor Wall; ordinary public Classic pixel-identical to `155e845`.
- Mobile screenshots at 390 and 1023 match `155e845` exactly. Existing layout suite covers 1024 / 1280 / 1440 / 1920 / 390 / 1023.

Browser backend traffic is intercepted, isolated fixture data. No protected/real account, uploaded object or publication is changed. These checks do not claim physical-device or owner acceptance. Screenshots include empty/populated/rich collapsed and fully expanded pages at each Desktop width, plus expanded Connections/Crew details at 1024 and 1440. Fixture CDN pictures are neutral images with varied aspect ratios; the Intro thumbnail is a real decoded development-video frame, not seeded account data.

## Boundaries

Natural columns may end at different heights, especially when one contains a very long open editor. This is unused page background, not padding inside stretched cards. Cards never jump to another column or hide content to force matching column bottoms. Testing covers a defined matrix, not every possible future component or browser. Future components must use the documented width/wrapping primitives and extend the stress fixture.

Save paths, drafts, visibility, privacy/authorization, Intro Preview, media lifecycle, artwork matching, immediate workflow actions, Wall/publication and public Classic remain unchanged. This task changes only Desktop presentation and browser coverage. No backend/API/schema/infrastructure, Production, main merge or Product Memory edits.

GamID Truth: UPDATED — unified Desktop column order, card-width adaptation, independent growth and current editor checkpoint; statuses/limits unchanged.

Product Memory: PROPOSED — a decision linked to IDEA-0001 for stable natural columns, compact summary/full editor separation and card-width responsive rules. No Product Memory record/index saved; separate explicit approval is required.

Deploy through the existing exact-ref/expected-SHA Cloudflare TESTING workflow only after successful checks, verify deployed files/screenshots, then STOP for Mazen review.

## TESTING deployment confirmation (2026-10-15)

[Cloudflare TESTING run 38668586693](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38668586693) **SUCCESS**, exact deployed source `43be3cbdd7dcbabdc04cc1a93f5b92bbd6f27ab7`. Existing workflow reran the complete build and smoke checks; no backend deployment or configuration change. Nine served frontend files match committed source after normal HTML stamping and line-ending normalization.

Deployed adaptive matrix **18/18 PASS**, including all six widths, all three content cases, sidebar actions, ten independently growing main cards, all expanded sections, decoded images, identical draft node across resize, no mutations/playback and no overlap/control overflow. Deployed layout suite **6/6 PASS**, media suite **4/4 PASS**, Classic Preview **2/2 PASS**. Deployed 390 / 1023 screenshots are byte-identical to archived `155e845`. Existing functional saves/uploads/drafts regressions passed locally at 1024 / 1280 / 390, with no errors or overflow. Full build: **1909 PASS / one existing opt-in SKIP / zero failures**.

Delivery screenshots are isolated fixtures on the deployed frontend: collapsed empty/populated/rich states at 1024–2560, fully expanded pages, plus readable Connections/Crew details at 1024 / 1440. No real account data or acceptance is claimed. The final delivery-confirmation commit is documentation-only; running frontend remains `43be3cb`. **STOP for Mazen visual review; not ACCEPTED.**
