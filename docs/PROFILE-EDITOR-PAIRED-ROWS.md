# Paired Desktop Profile Editor (TESTING)

Implementation checkpoint: `61de6220a37922a776cddd19771b10bdac4fde51`, authorized branch `feature/play-together-notifications`. Starting GitHub/local checkpoint: `5437dcf7024a4e695a305484c4251b41a67c1ab1`. Mazen explicitly authorized implementation using the four GamID-Layout-Proposal-v1 boards, with the final single-open-editor behavior below superseding the proposal's earlier multi-open discussion. **ACCEPTED by Mazen on 2026-10-15 after manual review of deployed TESTING 1ec1da3.**

## Current Desktop contract

Below 1024px, since 2026-10-17: after this editor restores the original DOM, the Mobile V2 Profile Deck takes over ([PROFILE-EDITOR-MOBILE-V2.md](PROFILE-EDITOR-MOBILE-V2.md), PENDING_ACCEPTANCE). The Desktop contract below is unchanged.

Targeted presentation follow-up: [PROFILE-EDITOR-SIDEBAR-CREW-PRESENTATION.md](PROFILE-EDITOR-SIDEBAR-CREW-PRESENTATION.md), product `35842e9`, widens the sidebar and reuses rich Crew directory tiles. Those new visual improvements await Mazen review; the accepted single-open editing behavior described here is unchanged.

At 1024px and above, two equal workspace columns use six paired summary rows:

| Row | Left | Right |
| --- | --- | --- |
| 1 | Avatar | Your Intro |
| 2 | Banner | About Me |
| 3 | Connections | My Socials |
| 4 | My Games | Game Display |
| 5 | Play Together (static navigation) | My Duo |
| 6 | My Wall | My Crew |

Only one editing section is open. Opening another closes the previous disclosure without saving, clearing or reconstructing any draft. About Me retains its five original nested editors and independent saves; selecting a nested editor closes its previous sibling. League remains nested in Connections. Share is a readonly sidebar utility, not an editing section. Preview, publication and the saved Classic summary stay in the sidebar.

Each pair shares only its compact header/summary tracks. The selected original section panel occupies a third grid track across the full workspace, below both summaries. Its natural content height moves subsequent paired rows downward together. Unrelated summaries never stretch to a long form's height; no absolute positioning, fixed form heights, height-measuring script, masonry gaps or duplicated controls are used. Summary labels are bounded; overflow items get counts and remain fully available in the actual editor. At narrow Desktop widths, About Me and Socials summaries wrap into readable groups. Intro retains its real, bounded 220x110 paused thumbnail. Images retain their aspect ratio and existing fallbacks.

`desktop-editor.js` moves original section cards into row containers and records restoration slots. Outer Desktop section wrappers use `display:contents` so each header, summary and original panel participates in its row grid while every field retains its actual section ancestry. Actual panels have named region semantics. This ancestry matters to save routing, dirty detection, transient feedback and owner cleanup. Original form ownership remains explicit. The Desktop capture listener controls only section disclosures; the unchanged mobile listeners still govern smaller widths. `desktop.reveal` is also used by notification/OAuth destinations and failed Save All, preventing those paths from opening multiple Desktop editors.

Crossing below 1024px restores the exact original DOM, icons, form attributes and pre-Desktop disclosure states. Draft values, Avatar crop Blob, Banner positioning and Intro local source stay owned by their original controllers. Reopening a Desktop editor retains the original nodes. Opening, closing, resizing or Classic Preview never saves or publishes. Section Save Changes and Save All retain their existing serialized save paths, error handling and immediate-action boundaries. No backend, provider, storage, privacy, publication or upload contracts change.

## Validation

- `npm run build`: syntax, both type checks and full repository suite; 1910 tests, 1909 pass, one opt-in skip, zero failures.
- `scripts/classic-preview-browser.mjs --adaptive-layout`: 18 fixture scenarios, empty/populated/rich at 1024, 1152, 1280, 1440, 1920 and 2560. All 11 editing disclosures tested for equal columns, aligned summary boundaries, full-width panels, control containment, long added content and unchanged summary dimensions. Rich fixtures include 14 games, 10 Crews, long labels and different image sizes. Sequential About Me drafts, original node identity, Desktop/mobile restoration, no writes and no playback pass.
- `scripts/profile-editor-browser.mjs`: new Desktop path at 1024/1440 covers Name/Bio/Roles/Intro drafts, isolated section save, Save All including hidden sections, partial failure/retry, failed-section and notification reveal, Banner crop/zoom draft restoration and save, Avatar/Intro drafts through section switches and Classic Back to Edit. Existing comprehensive mobile functional path remains at 390px, covering 18 sections, 20 independent saves, uploads/retries, relationships, visibility, Socials, About Me, owner changes and errors.
- `scripts/classic-preview-browser.mjs`: 1440/390 saved Classic, private/no-edits, three Wall states, no Intro, no writes, Avatar/Intro draft retention and unauthorized refusal pass.
- `scripts/classic-preview-browser.mjs --media-review`: 1024/1440/1920/390 real Intro frame, stored Steam avatar and League icon, two game covers, failed-media fallbacks, zero autoplay and Editor/Classic identical artwork pass. Summary height stays unchanged while Connections opens.
- Mobile screenshots at 390 and 1023 are byte-identical to the verified starting checkpoint `5437dcf`; no mobile visual redesign.

Browser services, media and writes are isolated fixture responses. No protected account or real stored data is used. Screenshots are fixture evidence, not live owner content. Chrome was tested; no physical-device or other-browser acceptance is claimed.

## Scope and review

TESTING delivery: source `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`, workflow run [38690648784](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38690648784), **SUCCESS**. [Account on TESTING](https://gamid-testing-static.gamid.workers.dev/account/). Nine served frontend files exactly match that checkpoint, including the asset stamp. Post-deploy isolated browser reruns pass: six empty/populated/rich layout cases at 1024/1440, Desktop 1024/1440 and full mobile functional 390, saved Classic 1440/390, and media 1024/1440/1920/390. Final screenshots wait for the real paused thumbnail to decode. Subsequent delivery documentation and fixture screenshot-wait changes do not alter deployed `dist/`.

The visual boards guide grouping, proportion and alignment; current controls retain approved functionality. No mockup-only Avatar remove/rotate/library, Banner gallery, per-Social visibility or other invented control is added. Banner remains 1920x320; four favorite games; permanent read-only handle; 12 Social platforms; provider verification labels unchanged. Full form bodies replace the boards' illustrative content with the real editor. Long names are truncated only in summaries, with full content in editors. Mazen explicitly confirmed Everything is approved and separately authorized saving Product Memory on 2026-10-15. Existing IDEA-0001 and REV-0004 record the accepted rationale and manual outcome; no duplicate records were created. This acceptance concerns Desktop layout and editing behavior; unchanged mobile presentation is preserved without claiming a new Android real-device test. Acceptance-only updates do not modify functionality, visuals or the deployed source. See PROJECT_HANDOFF.md §62.
