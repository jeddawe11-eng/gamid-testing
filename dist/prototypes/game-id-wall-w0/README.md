# Game ID Wall - W0 risk prototype

**Throwaway. Isolated. TESTING only.** This is not the Wall product and not W1. It exists to answer feasibility questions from the
Game ID Wall architecture study on real devices. It contains sample content only and has no accounts, profiles, connections, saving,
publishing, QR, backend or database. State lives in memory (optionally `localStorage` on the same browser for the hosting-test
pages). Nothing here is linked from the real GamID product.

Live TESTING URL: `https://jeddawe11-eng.github.io/gamid-testing/prototypes/game-id-wall-w0/`

| Page | Purpose |
| --- | --- |
| `index.html` | hub |
| `editor.html` | mobile-first editor: one 9:16 stage at a time, Overview, visitor-style Preview |
| `wall-view.html` | hosting **shape A**: the Wall is the top-level page, with a simulated Intro overlay |
| `host-nested.html` | hosting **shape B**: the same Wall inside an outer iframe (players nested one level deeper) |
| `embed-lab.html` | real YouTube / Spotify players at chosen box sizes (loads only on tap) |
| `viewports.html` | the same Wall at 360 / 390 / 412 / 768 px and desktop columns 560 / 640 / 720 (emulated) |

Useful URL parameters: `wall-view.html?intro=1&col=560|640|720&contain=none|clip|paint|cv&diag=1&tools=1`,
`editor.html?stage=1|2|3&mode=overview|preview&diag=1`, `host-nested.html?delegate=full|current|none`.

## What is real and what is simulated

* Real: the 1000-unit geometry model, stage-local z-order and groups, pointer / pinch gestures, the embed overlap rule, real YouTube
  (`youtube-nocookie.com`) and Spotify iframes, real hosting-shape differences.
* Simulated: the Intro (small overlay that only locks scroll, reveals, starts the Wall at the top of Stage 1 and can replay). GamID
  blocks (**fake** data, labelled "SAMPLE DATA"). All media is hard-coded (no URL can be entered).
* Provisional numbers (200x200 YouTube inline minimum, 120x70 tile, 44 px tap floor for Spotify) are test hypotheses, not policy.

## Manual test sequence for a real phone (Samsung first)

1. Open `index.html`, then **Editor**. Confirm the stage fills the screen width comfortably and is not cut off at the bottom.
2. Tap an element (select), drag it. Drag it to every edge: it must stop at the stage edge (hard containment). Scroll should never
   fight the drag.
3. Drag a corner handle to resize; then pinch a selected element with two fingers.
4. Turn on **Multi**, tap two elements, **Group**, drag and resize the group, then **Ungroup**. Try **Forward / Back** and **Layers**.
5. Select a text, open **Props**: change font, size, colour, gradient, outline, shadow, glow. Add glow/shadow text near the very top
   and bottom of a stage.
6. Open **Backgrounds**: switch the Wall gradient, toggle art, give Stage 2 its own background, cycle **Seams** containment.
7. Tap **Overview**, look at every seam (pink guide lines), scroll the Wall. Tap a stage label to return to editing it.
8. Select the YouTube (Stage 2) and Spotify facades: check the size readouts; use **Props -> Preview / Interact** (overlay opens, closes
   and the player is destroyed). Try to put text in front of a player: it is placed back behind and a message explains why.
9. Tap **Preview**. Scroll normally. Tap the big YouTube (plays inline), tap Spotify, then tap the small YouTube tile on Stage 3
   (a larger in-page player opens; close it). Note fullscreen, and whether the page can still scroll while an inline player is
   active.
10. Open **Embed size lab** and try Spotify at several widths and heights (load, resize, note what Spotify does).
11. Open **wall-view.html?intro=1** (shape A) and **host-nested.html?intro=1** (shape B) and compare: URL bar behaviour, scrolling,
    fullscreen on YouTube, nested scrolling, whether the Intro overlay locks scrolling.

## Real device evidence so far

* **Real Samsung Android / Chrome: TESTED** by Mazen. **iPhone / iOS: NOT TESTED** (no iPhone available). iOS is neither PASS nor FAIL and
  must not be inferred from Android or emulation.
* Worked on the Samsung: the 3-stage Wall and Overview, the continuous scrolling Wall, normal drag/resize, text handles, real YouTube and
  Spotify embeds loading, the larger in-page YouTube player and its external Close button, Shape A and Shape B (no meaningful practical
  difference noticed *on this Samsung only*), the viewport comparison (360 px composition held).
* **Spotify:** Playlist rendered at 360x352, 260x152 and 200x80; Track at 200x80. Very small sizes render but the UI is compressed/cropped.
  Provider acceptance is not a good layout: W1 needs a product minimum or variants.
* **YouTube:** 200x70 is the overlay/tile case; 200x200 is inline but a poor square crop of a 16:9 video. Keep the video aspect ratio;
  small Wall tiles keep tile -> tap -> larger in-page player.
* **Two editor bugs found and fixed in W0 (re-test on the Samsung):** (1) a tiny element near a stage edge could not be enlarged;
  (2) a group had no usable resize handles (Multi stayed on and toggled the group off when tapped).

### Re-test on the Samsung (the two fixes)

1. Editor -> Add -> Photo. Drag a corner handle to shrink it very small, then drag it into a stage corner. Its four handles must now sit
   apart from each other (outside the tiny box), each grabbable; a dashed move pad lets you drag the tiny element itself.
2. Grab the corner handle that points into the stage and enlarge it again.
3. Also try the gesture-free path: Layers -> tap the element -> Props -> Size -> Bigger / 2x bigger.
4. Turn on Multi, tap two elements, tap Group. Multi turns itself off and a dashed gold group box with four corner handles appears.
   Drag the group, drag a corner to resize it uniformly, tap it again (it must stay selected), then Ungroup (same size and place).

## Product notes recorded here (backlog, not W0 work)

* Game lists must be **provider-neutral and collapsible** (bounded initial count, expand/collapse control, safe for 200-300+ games; never
  auto-expanding the profile/Wall). Playtime/hours is **hidden by default** publicly, shown only if the owner turns it on.
* Separate from W0: the **real** Intro stretches landscape videos. It is logged as an unfixed backlog bug; W0 never touched it.

## What only a real iPhone can answer

Safari toolbar / `dvh` behaviour, whether `overflow:hidden` really locks page scroll during the Intro overlay, YouTube and Spotify
`playsinline` and fullscreen behaviour (especially nested), autoplay blocking, pinch versus Safari's own page zoom, iframe touch
handling, memory pressure with a tall page plus iframes.
