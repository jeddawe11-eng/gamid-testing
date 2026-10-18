# My Wall Desktop Text & Fonts upgrade, Phase 2 (TESTING)

Mazen's task "GAMID — My Wall Desktop Text & Fonts Upgrade — Phase 2" (2026-10-18): the desktop Text panel becomes an organized typography library, and eleven curated fonts are added. It follows Phase 1 ([`WALL-EDITOR-DESKTOP-REDESIGN.md`](WALL-EDITOR-DESKTOP-REDESIGN.md), approved) and keeps its look. Branch `feature/play-together-notifications`. Visual review and final acceptance by Mazen are pending. This changes no capability, limit or contract, so GamID Truth is unchanged.

## The eleven fonts

All are licensed under the **SIL Open Font License 1.1**, verified against Google's official repository (`github.com/google/fonts`, `ofl/<family>/METADATA.pb`: `license: "OFL"`). The files are the official Google Fonts WOFF2 **latin subsets**, unmodified, served from this site (nothing is loaded from a third-party host). Copyright notices, Reserved Font Names and the licence text are in `dist/wall-kit/fonts/OFL-NOTICES.txt`; the records are in `fonts/LICENSES.txt` (the repository requires the licence to be recorded before a font is bundled).

| Category | Font | Catalog key | Weights shipped | Copyright (abridged) |
| --- | --- | --- | --- | --- |
| Fantasy & Gothic | Cinzel Decorative | `cinzel-decorative` | 400, 700, 900 | 2012 Natanael Gama (RFN "Cinzel") |
| | UnifrakturCook | `unifraktur-cook` | 700 (its only weight) | 2010 j. 'mach' wust; 2009 Peter Wiegel (RFN) |
| | Pirata One | `pirata-one` | 400 | 2012 Rodrigo Fuenzalida, Nicolas Massi (RFN "Pirata") |
| | Eagle Lake | `eagle-lake` | 400 | 2012 Brian J. Bonislawsky DBA Astigmatic (RFN) |
| | Metal Mania | `metal-mania` | 400 | 2012 Open Window (RFN) |
| Luxury Signature & Script | Great Vibes | `great-vibes` | 400 | 2015 The Great Vibes Pro Project Authors |
| | Alex Brush | `alex-brush` | 400 | 2011 The Alex Brush Project Authors |
| | Pinyon Script | `pinyon-script` | 400 | 2024 The Pinyon Project Authors |
| | Italianno | `italianno` | 400 | 2009 The Italianno Project Authors |
| | Tangerine | `tangerine` | 400, 700 | 2010 Toshi Omagari |
| | Ballet | `ballet` | 400 (optical-size axis, default) | 2020 The Ballet Project Authors |

**Reserved Font Names.** Five families declare one. The files are not modified by GamID, and the CSS family names (`GamID Cinzel Decorative`…) are only local aliases for the unmodified files, so no modified font is distributed under a Reserved Font Name. No blocker was found: every requested font could be legally and technically bundled, and none was replaced.

**Weights.** Fonts with a single weight are declared as that weight, as Bebas Neue and Russo One already were: if the owner picks a heavier weight, the browser synthesizes bold. UnifrakturCook only exists in 700, so its 700 face is used at every weight. Latin only: the platform is primarily English, so no Latin-extended or other script subsets were added.

## How the fonts work through the Wall

- **Registry:** `dist/wall-kit/fonts.js` is the one catalog. A text element stores only a **stable catalog key** (kebab-case, e.g. `great-vibes`); the CSS stack is resolved at paint time. The payload validator, the database function (`private.wall_element_payload_errors`, migration `20260925140000`: `^[a-z0-9][a-z0-9-]{0,39}$`) and the shared corpus check only the key's **format**, so adding keys needs **no document, migration or backend change**. An unknown or retired key paints with the fallback stack, so no saved Wall can break.
- **Existing fonts:** all twelve keep their key, label and stack. The only label change is the group name `System` → `System & Classic` (shown in the Text panel and as the group name in the Properties font select). Saved text content, sizes, positions, alignment, effects and styles are untouched.
- **Everywhere the same code paints:** the editor canvas, Preview, the owner's draft and the **published / public Wall** all paint through `wall-kit/paint.js` with `wall-kit.css`, so the family seen in the editor is the family visitors get. Crew pages and templates use the same stylesheet.
- **Loading:** `@font-face` rules declare every face with `font-display: swap` (text is never invisible; the fallback shows until the file arrives). A browser downloads a face only when text in that family is rendered, so a Wall downloads only the fonts it uses. In the editor, the Text panel's cards get their family only when they are near the visible part of the panel (an `IntersectionObserver`), so the library is not fetched as a whole. Measured: **0** new files on page load; **4 to 5** when the Text panel opens at common desktop heights; all 11 only after scrolling to the end (or on a screen tall enough to show every card).
- **Curated:** there is no font upload and no "My Fonts": the library is fixed by GamID.

## The desktop Text panel (900px and wider)

New styling in `editor-desktop.css` (the Phase 1 stylesheet; Phase 1's shell and Add rules are unchanged):

- **Presets** (Heading, Text, Gaming title) as cards with an icon tile, matching the Add cards.
- **Search fonts:** filters the list by name (case-insensitive; also matches the key); empty categories disappear; a "No font matches" note appears when nothing matches; clearing restores everything. Search only hides cards in the list: it never touches the canvas or the saved Wall.
- **Categories** with gold headings: Gaming, Fantasy & Gothic, Luxury Signature & Script, System & Classic. No font is listed twice.
- **Cards:** a compact grid (two columns where the panel is wide enough, one where it is not), each card a real button showing the font's name in the editor's UI font and a **live sample ("Legend") in its own family**. Long names wrap and never clip or overlap. The font of the selected text element(s) is marked with a purple / gold card and a gold diamond (`aria-current="true"` for assistive technology); a mixed selection marks none.
- **States:** hover and keyboard focus (visible gold ring), active, selected; Tab reaches every card and Enter / Space apply it; smooth scrolling in the panel, switched off for reduced motion; no continuous animation.
- **Unchanged behavior:** choosing a font is the same undoable payload update as before, and with no text selected the same guidance appears.

**Phone and tablet:** the same buttons as before (one line, the name in its own font). The search field, the samples and the "no match" note are hidden below 900px (`editor.css`, three selectors). The new fonts appear in those lists, in new categories in the existing style, and in the Properties font select on every device.

## Validation

- **`tests/wall-text-fonts.test.js`** (10 tests): the twelve existing fonts are unchanged; the eleven new keys, labels, categories and order; no duplicates; the validator and the SQL mirror accept every new key and a Wall with each is valid; rendering and the safe fallback; each file is a real WOFF2 latin subset with its `@font-face` (swap, no remote host); licence records and notices; the library structure (cards from the catalog, search, `aria-current`, no upload); lazy loading; the desktop-only split.
- **Suite:** `npm run build` (lint, typecheck, voice typecheck, all tests): **1948 tests, 1947 passed, 0 failed, 1 skipped**.
- **End to end** in the real editor (local lab with a stand-in session client; no network): 11 text elements, each given one new font from the library, saved, reloaded (same keys), shown in Preview and painted by the public pipeline: every family painted and **all 11 faces loaded**; the same family set in the editor canvas, Preview and the public view; no failed request, no page error.
- **Panel behavior:** 15 checks pass (library structure, guidance with no selection, search, no match, clear, search leaves the Wall alone, current card, keyboard Enter, visible focus, only the font changes in the saved text, Undo, Redo, the Properties select lists the new fonts).
- **Regression:** the other eight tool panels at seven widths (390 to 1920, 56 states) are unchanged versus the previous build (largest single-pixel delta 4 of 765, Chrome's own noise); on phone and tablet widths all 12 existing font buttons keep their size and font and the presets are identical; the 27-step behavior transcript (every tool, every Add action, Undo / Redo, Multi-select, stages, Save, Preview, Publish) is identical to the previous build.

## Limitations

- The lab has no live backend, so Publish is checked for parity and the public pipeline is checked directly (the same `paintDocument` the published Wall uses), not through a live published account.
- Latin only; synthesized bold for single-weight fonts (as before for Bebas Neue and Russo One).
- The library samples say "Legend" for every font, a deliberately short English word that fits two-column cards.

## TESTING delivery

- **Deployment:** source `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d`, [workflow 39101612969](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39101612969) SUCCESS (full project validation and the deployed-site smoke check passed), at <https://gamid-testing-static.gamid.workers.dev/wall-editor/> (owner login required).
- **Served files:** 27 of 27 are byte-identical to the commit (SHA-256): the 14 font files, `wall-kit.css`, `fonts.js`, `LICENSES.txt`, `OFL-NOTICES.txt` and the editor files. Fonts are served as `font/woff2`.
- **Not done:** the editor was not opened with a real account (real accounts are protected), and nothing was published; the lifecycle checks above ran on the local lab.
- **Status:** awaiting Mazen's visual review and final acceptance. Phase 3 is not started and not authorized.

## Category accordions (2026-10-18)

Mazen's task "GAMID — My Wall Desktop Text: Accordion + Custom Font Upload", part 1. **Desktop only** (900px and wider); phone and tablet keep their plain headings and full list.

- **Headings:** each of the four categories is a real `<button>` with the category name, its **real font count** (Gaming 5, Fantasy & Gothic 5, Luxury Signature & Script 6, System & Classic 7) and a chevron. `aria-expanded` gives its state; Enter and Space toggle it; focus is visible (gold ring); targets are at least 44px.
- **Open and close:** every category **starts collapsed**, a click toggles only that one, and several may be open. The two-column cards with live samples are unchanged.
- **Search:** looks in every category, collapsed or not. Matching categories show open; empty ones disappear. While searching, a heading click changes nothing (`aria-disabled`), and clearing the search **restores each category's previous open / closed state**.
- **Kept:** the current-font highlight, lazy font loading (a collapsed category fetches nothing; opening one fetches only its faces), choosing a font, Undo / Redo, Preview, Save and Publish.
- **Breakpoint:** crossing 900px switches between the accordion and the plain list in place, and the open / closed states survive.

**Validation:**

- **Accordion browser checks:** 13 pass, including counts, collapsed by default, nothing fetched while collapsed, opening fetches only that category's 5 faces, two columns, keyboard Enter and Space, several categories open, visible focus, search across collapsed categories, restore after clearing, the current font kept, and phone headings back to plain text.
- **Fit:** every heading stays on one line at 1100 to 1820px, with no horizontal overflow.
- **Regression against the previous build:** 59 states unchanged (the eight other panels at seven widths, plus the Text panel at 390, 768 and 899px; largest single-pixel delta 3 of 765). The 27-step behavior transcript is identical, and the font lifecycle (create, save, reload, Preview, public paint, all 11 faces) passes.
- **Suite:** `npm run build` gives 1949 tests, 1948 passed, 0 failed, 1 skipped, including one new accordion test in `tests/wall-text-fonts.test.js`.

## Upload My Font: NOT implemented (awaiting Mazen's architecture approval)

Part 2 of the same task, extended by Mazen's "User-Owned Font Storage & Usage" requirements, needs database, storage, policy and Edge Function changes. Under the task's own gate it is **not implemented**, and no upload button was added. What exists today:

- **Storage and table:** the Wall media bucket (`wall-media`), the `wall_assets` table (`wall_assets_mime` check) and its register function accept **images only** (`INVALID_WALL_ASSET_TYPE`).
- **Upload gateway:** `usage-upload` validates JPEG / PNG / WebP / AVIF and video, with no font validation.
- **Visitor access:** the policy "published wall media is readable" covers only assets referenced as Wall media in the published snapshot.
- **CSP:** every Wall page has `font-src 'self'`.
- **Quota:** `private.usage_stored_bytes` already sums **every object under the owner's folder in any bucket** against the fixed **200,000,000-byte per-account quota**, and `reserve_usage_upload` adds reservations, quota rejection and cleanup. A font stored under the owner's folder would be counted automatically.
- **Reserved field:** the text payload already reserves an optional opaque `fontRef` (at most 200 characters), and its validator and the database never inspect it.

**Proposed design** (each part needs Mazen's approval):

1. **Storage:** a private bucket `wall-fonts` (`font/woff2` only, 2 MiB per file) at `<owner>/fonts/<sha256>.woff2`. Upload goes **only through the existing `usage-upload` gateway**, so the existing reservation, quota rejection (`ACCOUNT_STORAGE_QUOTA_EXCEEDED`), 26-hour release and cleanup rules apply, with no unlimited storage.
2. **Server-side validation** in the gateway, never trusting the extension or the client MIME type:
   - the WOFF2 signature and `length` equal to the real byte count;
   - the table directory parsed within bounds;
   - the required tables (`cmap`, `head`, `hhea`, `hmtx`, `maxp`, `name`, `OS/2`, `post`, and `glyf` or `CFF`) present;
   - `totalSfntSize` and `numTables` capped.

   Browsers additionally sanitize every web font (OTS) before use. WOFF2 only at first; TTF / OTF would need a WOFF2 encoder in the gateway and are deferred.
3. **Ownership and deduplication:** a new table `wall_fonts` (id, owner, sha256 **unique per owner**, sanitized display name of at most 60 characters, bytes, licence-acknowledged time) with **owner-only RLS**. Owner RPCs list, register and delete. Fonts are never added to the shared library and never listed to anyone else.
4. **On the Wall:**
   - a text element keeps a catalog `fontFamily`, which is the fallback, and stores `fontRef: "font:<uuid>"`;
   - the CSS family name is generated (`GamID User <uuid>`), never taken from user text, so there is no CSS injection or collision;
   - the bytes are loaded with `fetch` plus `new FontFace(name, bytes)`, so `font-src 'self'` stays unchanged.
5. **Visitors:** extend the published-media read path (policy plus the `public-media` lease) to fonts **referenced by the published snapshot of a public identity only**. A visitor never sees the owner's library or any unreferenced font.
6. **Deletion:**
   - deleting a font referenced by the **published** Wall is refused with a clear message (the same rule existing Wall assets follow);
   - if the font is used only in the draft, the owner is warned and the text falls back to its catalog font.
7. **Licensing and abuse:** a required acknowledgement ("I own this font or am licensed to embed it on the web"), recorded with its time, and an administrator removal path.
8. **Accounting and costs:** fonts count inside the existing 200 MB per-account allowance, and the Usage page gains a "Wall fonts" line. There is **no new paid service, fee or package**. Supabase storage and egress stay on the existing plan; each visitor of a Wall that uses a custom font downloads that file once (cacheable). A 2 MiB cap keeps this marginal.

**Changes that need approval:**

- one migration (bucket, `wall_fonts` table with RLS and RPCs, the published-read policy extension, the usage line);
- `usage-upload` and `public-media` Edge Function updates and deployment;
- the editor's Upload My Font UI and My Fonts category, and font loading in the editor and the public Wall.
