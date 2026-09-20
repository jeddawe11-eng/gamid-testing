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

## What only a real iPhone can answer

Safari toolbar / `dvh` behaviour, whether `overflow:hidden` really locks page scroll during the Intro overlay, YouTube and Spotify
`playsinline` and fullscreen behaviour (especially nested), autoplay blocking, pinch versus Safari's own page zoom, iframe touch
handling, memory pressure with a tall page plus iframes.
