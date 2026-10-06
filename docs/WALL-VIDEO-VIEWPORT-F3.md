# F3: viewport-gated published Wall videos (TESTING)

## Baseline / current paths

Continuation: PROJECT_STATE -> GamID Truth / AGENTS -> F4 record -> current Git. Started on clean, pushed feature/play-together-notifications at 8348779f8968b1a78d719f54b09fd26172d7f8a9; deployed product baseline 2ccb0f8aeec701bd4c0e6006c36d4c628a9ec091. Main remains da2e020928f546e6b637f38629fd673b15544c2b. Mazen's F3 request accepts F4 as the implementation baseline; F4 is preserved.

The visitor first obtains get_public_wall and prepares its referenced assets. F4 reuses anonymous signed video URLs. On reveal, public-wall.js paints using the common Wall painter and video pool. Video layers use the el:<element-id> family; stage/Whole-Wall backgrounds use their background family. Previously the pool immediately attached each src, set preload=auto and autoplay, and queued play(). canplay and document visibilitychange could resume every connected video, regardless of scroll position. Whole-Wall copies share a clock. Owner canvas and Preview use this same pool; their behavior remains unchanged. Assets grid representative previews have a separate one-shot 120px IntersectionObserver, not suitable for ongoing playback pause/resume. Provider player iframes remain tap-to-play and are untouched. Pictures/GIFs and Intro are untouched.

## Implementation

Published visitor pools opt into dist/wall-kit/video-viewport.js. One IntersectionObserver per pool observes the actual video nodes, so ancestor frame/stage clipping applies even to oversized Whole-Wall copies. Initially a video has no src, preload=none and no autoplay. Entering the near region attaches the same authorized URL once and preserves muted, loop, playsinline, no-controls behavior. Leaving pauses, turns autoplay off and changes preload to metadata while retaining src/currentTime/the pooled node; canplay events cannot wake an ineligible video. Return reuses it. Page hiding and Replay Intro suspend the visitor pool; page/show resume respects eligibility. Background family copies rejoin an active sibling's clock, or the paused leader when no sibling is active. Default owner/editor, Preview and one-off rendering retain the existing eager behavior and clock logic.

A geometry fallback without IntersectionObserver remains lazy and clips the video's bounds to the artwork frame and stage. Passive scroll/resize checks are batched with requestAnimationFrame. Teardown disconnects observer/listeners and releases sources via the existing pool clear.

Margin: 320px above/below the viewport, zero horizontal expansion, threshold 0 (isIntersecting). Tested viewport 1280x720, Wall width 900. This allows about 44% of one viewport of lead-in without loading the entire next stage. A layer starting at 910px (190px below the viewport) was loaded/decoded before scrolling; one at 1196px remained source-free. A tiny local Whole-Wall fixture decoded its first frame in 11–21ms and its far clipped copies remained source-free. This is a bounded lead-in, not a promise that slow mobile/4K playback can never buffer. No new poster, persistent preview, picture derivative or placeholder redesign is introduced.

F4 and all Supabase permissions/buckets/lifetimes are unchanged. URL preparation still occurs up front for the current published manifest; F3 gates src assignment and media bytes, not the signing RPC. F4 continues to avoid fresh signing on repeat access in the same tab. No six-hour lifetime extension, auth weakening, database change, media re-encoding or cache-header change.

## Focused tests

92/92 passed: nine new F3 tests plus F4 reuse, public publishing, split/video layers, previews, backgrounds, Templates and Truth. Cases cover no offscreen src/play/autoplay, near activation, muted/loop/inline playback, guarded late canplay, pause/return without source churn, multiple videos, hidden-tab/Intro suspension, Whole-Wall clocks, clipped fallback, cleanup and unchanged eager owner/one-off rendering. Lint/typecheck passed before deployment; complete workflow validation is recorded below.

## Bounded real TESTING network evidence

A local read-only viewer used the unchanged @black public Wall snapshot, the actual production painter/pools and live anonymous TESTING signing/media. Nine referenced video objects across three stages. Baseline pool source came directly from deployed F4 commit 2ccb0f8. A loopback measurement proxy counted successful Supabase HTTP 206 payload requests and body bytes, with a 512 KiB cumulative ceiling per video/run. No signed URL/token was logged. Unrelated image/live-GamID/Intro downloads were omitted. The proxy used no-store locally for conservative reload measurement; actual Supabase cache headers were not changed. This is an instrumented bounded replica, not an uninstrumented full public-page download or a monthly savings forecast.

| Phase | Pre-F3 | F3 |
|---|---:|---:|
| Initial page open, no scroll: payload requests | 9 | 5 |
| Initial body bytes delivered | 3,039,536 | 1,049,684 |
| Videos still source-free | 0 | 4 |
| Scroll to y=1000: additional payload requests | Not measured (all nine already started initially) | 2 |
| Scroll to y=1000: additional body bytes | Not measured | 941,276 |
| After controlled scroll, cumulative body bytes | Initial baseline above, no scroll claim | 1,990,960 |
| Scroll back to top: additional requests / bytes | Not measured | 0 / 0 |
| Scroll-back: additional signing requests | Not measured | 0 |
| Actual browser reload: additional signing requests | Not measured | 0 |
| Reload: additional successful payload requests / bytes | Not measured | 4 / 525,396 |

Initial bounded difference: 1,989,852 fewer bytes (~65.5%) and four fewer requested video objects. Two stage-3 videos stayed source-free throughout the controlled scroll and scroll-back. Far first-stage videos paused, then resumed on return; stage-2 videos paused again on return to top. Signing stayed at nine throughout initial/scroll/back/reload, proving F4 reuse remained active. Reload byte results are additionally censored by the remaining per-object run ceiling (one previously capped large video could not transfer again); do not extrapolate that reload figure or claim production browser-cache savings. Some large MP4s stalled/failed metadata because the artificial ceiling prevented tail/additional range reads. Those induced stalls are not valid playback acceptance evidence. Small WebM layers decoded and played normally, including a near-but-not-yet-visible layer.

The independent tiny local Whole-Wall fixture (no Supabase bytes) confirms real browser IntersectionObserver ancestor clipping and native playback. Its first copy loads/plays, far copies do not; scrolling activates eligible copies and pauses distant ones. Native active-copy clocks stayed within 0.11s in the final fixture. Clock synchronization runs only when a paused copy activates/resumes and once at metadata readiness; late canplay events do not repeatedly seek already-playing siblings. Unit tests pin this regression.

No protected user, saved/published Wall, storage object or session was changed. No heavy Monitor scan or Global Usage quota acceptance was run.

## Deployment / continuation

Product checkpoint: `3b9d8b1c27fb0c9b3fa6fd0c2ee682dab7618906`, branch `feature/play-together-notifications`. TESTING deployment run `37459488763` succeeded; Worker version `5aceda43-f998-4935-a629-01d3c1f3001e`. Complete workflow: 1,624 tests, 1,623 passed, one skipped, zero failed; lint and typechecks passed. Served `wall-kit/video-viewport.js`, `wall-kit/video-background.js` and `public/public-wall.js` matched the product source exactly (line endings normalized); unchanged F4 `public/published-video-url-cache.js` also matched. Public HTML stamp verified as 3b9d8b1. Site: https://gamid-testing-static.gamid.workers.dev/ . No database/Edge Function deployment was needed. Final documentation HEAD is discoverable in Git; later commits after the product checkpoint change only continuation records. F3 remains awaiting Mazen manual acceptance; F4 is accepted as the baseline. GamID Truth: NO CHANGE REQUIRED (delivery timing optimization, no new visibility/limit/contract).

Manual acceptance: open a published multi-stage Wall on desktop and mobile; scroll naturally through video layers and stage/Whole-Wall backgrounds, checking no new blank/black flash, correct muted looping/alpha/layout. Scroll away and back, then Replay Intro and return: videos should pause/resume without resets; existing images, embeds and navigation should remain correct. Reload/revisit in the same tab and check playback and stable signed URLs using Network if desired. Do not save/edit protected profiles for these checks.

Stop after F3. Remaining candidates, not implemented: F2 smaller oversized Intro derivatives; F5 native Intro streaming; F6 safe private-media cache behavior; F7 resized picture derivatives; F8 lightweight/persistent previews only if justified. Recommended next discussion: F2, given the audit's 14.67 MB 4K Intro and the remaining unavoidable visible-video delivery. Review F3 manual playback first; do not implement another optimization without authorization.
