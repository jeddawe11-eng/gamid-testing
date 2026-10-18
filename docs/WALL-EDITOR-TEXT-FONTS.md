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

## Upload My Font: the proposal (historical, 2026-10-18; approved and implemented the same day - see Custom fonts below)

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

**Accordion TESTING delivery:** source `8da87669a346e831d8998a3b00323c96727a77a0`, [workflow 39103420138](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39103420138) SUCCESS; the served editor and font files are byte-identical to the commit. Awaiting Mazen's review.

## Custom fonts: implemented (2026-10-18)

Mazen's task "GAMID — Custom Font Upload Implementation" approved the proposal above with one product rule: **at most 3 active custom fonts per account**. Implemented on TESTING; Truth `custom-wall-fonts` is **PENDING_ACCEPTANCE**.

**Server (migration `20261018120000_wall_custom_fonts`; Edge Function `usage-upload` v10).**

- **Storage:** private bucket `wall-fonts` (2 MiB, `font/woff2` only) at `<uid>/fonts/<sha256>.woff2`. Only the gateway writes it: there is no client write policy, and the account-wide gateway policy already refuses direct writes.
- **Gateway order:** licence confirmation, declared type, at most 2 MiB, then **structural WOFF2 validation**:
  - the signature, and the declared length equal to the real length (so nothing can be appended);
  - table count and reserved field;
  - bounded sizes, a bounds-checked table directory with strict UIntBase128 values and no duplicate tables;
  - the required tables and the outlines (`glyf` with `loca`, or `CFF` / `CFF2`);
  - in-bounds metadata and private blocks;
  - collections (`ttcf`) refused.

  Then the server-computed **SHA-256 must be the file name**, which makes deduplication tamper-proof. Only then: reserve (quota and the 3-font limit), store, complete and **register**. A refused registration removes what was just stored; a failed store releases the reservation. Fonts never use the resumable route.
- **Limits in the database** (`reserve_usage_upload` patched in place, plus `register_wall_font`, both under the existing per-account advisory lock):
  - 3 fonts, counting registered fonts **and** in-flight or stored-but-unregistered ones, so concurrent uploads cannot pass it;
  - an identical font (same SHA-256) is answered as `duplicate` with no new slot and no new file;
  - the 200 MB quota is unchanged, and font bytes count toward it automatically.
- **Registry and ownership:** `wall_fonts` (RLS on, no client grants).
  - **Owner RPCs:** `list_my_wall_fonts` (fonts, limit, whether the saved draft or a published Wall uses each) and `delete_my_wall_font`.
  - **Service-only:** `register_wall_font` (the gateway).
  - **Names:** control characters are stripped and names are kept to 60 characters.
- **Walls:** a text element stores `fontRef: "font:<font_id>"` and keeps its catalog `fontFamily` as the fallback.
  - A trigger refuses any draft naming a font its owner does not have (`WALL_FONT_NOT_FOUND`).
  - The document validators are unchanged: `fontRef` was already an opaque, reserved field.
- **Deletion:**
  - refused while the saved draft uses the font (`WALL_FONT_IN_USE`) or any published snapshot does (`WALL_FONT_PUBLISHED`);
  - the gateway's delete check refuses a registered font file (`WALL_FONT_REGISTERED`), and a restrictive Storage policy blocks the owner's direct delete of it;
  - unregistered font files older than an hour are removed by the owner's usage cleanup.
- **Visitors:** the policy "published wall fonts are readable" admits a font only while the **published, enabled** Wall of a **PUBLIC** GamID references it, the same predicate as Wall media. `get_public_wall_fonts(handle)` lists exactly those. A visitor never sees the private library; signing stays owner-only.
- **Usage:** a `font` media category ("Wall Fonts" in the Usage Center) and the line **Custom Fonts n / 3**.

**Front end.**

- **Kit module:** `dist/wall-kit/custom-fonts.js` turns only a well-formed `font:<uuid>` into a **generated** family (`GamID Custom <hex>`), so no user text reaches CSS. It registers fonts from their bytes with the `FontFace` API, so `font-src 'self'` is unchanged.
- **Painting:** `paint.js` draws the custom family first and the catalog fallback after it. So the editor canvas, Preview and the published Wall all show it, with the fallback until it loads or if the browser's sanitizer refuses the file.
- **Editor:** `font-store.js` lists and registers the owner's fonts on load.
- **Desktop Text panel, My Fonts** (above the library and its accordions; hidden below 900px like the other desktop additions):
  - the **n/3** count, the licence checkbox (required before the file dialog opens) and **Upload My Font**;
  - a **real preview**: the browser must accept the file as a font first;
  - clear messages for the limit, quota, size, type, invalid file, licence, duplicate, in-use and published cases;
  - cards with a live sample, a "Published" / "On your Wall" status and a two-step delete;
  - unsaved uses are caught before asking the server.

  Choosing a library font (Text panel or the Properties menu) replaces a custom font.
- **Published Wall:** fetches fonts only when its snapshot names a `fontRef`, and only through `get_public_wall_fonts`.

**Validation.**

- **`tests/wall-custom-fonts.test.js` (17 tests):**
  - **Validator:** all 19 real WOFF2 files in the repository accepted. Refused: non-fonts (PNG, HTML, SVG, ZIP, raw TTF, WOFF 1), collections, a WOFF2 with script appended, every structural fault, flipped header fields and over 2 MiB.
  - **Gateway route** (fake backend): licence, type, hash, size, ownership and path refusals happen before any reservation; the limit and the quota store nothing; duplicates store nothing; a refused registration removes the file; a failed store releases the reservation; no resumable route; delete refusal; cleanup.
  - **Kit:** injection-safe names and single registration.
  - **Static contracts:** the UI, the published Wall and the migration's security shape.
- **`tests/wall-custom-fonts-db.test.js` (10 tests):** the **real migration** on PGlite after the real usage-gateway migration. Ownership and RLS, deduplication, the limit at reservation and registration, in-flight slots, quota, the draft reference check, both deletion refusals, the restrictive delete policy, the visitor policy (DRAFT / PUBLIC / disabled / unreferenced) and orphan cleanup.
- **TESTING rehearsal (rolled back),** as the service role, GM-TEST-01, GM-TEST-02 and an anonymous visitor (SQL impersonation; no sign-in):
  - all assertions passed, including the three in-place patches, the limit, deduplication, in-flight slots, cross-account refusals, the draft trigger through `save_my_wall_draft`, `WALL_FONT_IN_USE` and `WALL_FONT_PUBLISHED`, the visitor policy and the anonymous RPC;
  - the restrictive delete, evaluated as the Storage API does it, with a positive control.

  Afterwards the bucket, table, personas' drafts, visibility, publications and objects were verified unchanged. Then applied, and the history repaired.
- **Live concurrency (TESTING, GM-TEST-02, synthetic receipts only):** with 2 slots held, two simultaneous reservations raced for the last slot; exactly one won and the other got `WALL_FONT_LIMIT`. The synthetic receipts were then removed (0 left).
- **Live gateway and API with the public key only:**
  - an unauthenticated upload gets 401, and a foreign origin 403;
  - CORS admits the two font headers;
  - anonymous `list_my_wall_fonts` and `register_wall_font` are denied;
  - `get_public_wall_fonts('black')` returns `[]`;
  - an anonymous or public URL read of a font path gets 400.
- **`usage-upload` v10:** deployed after confirming v9 was identical to the previous repository version; the downloaded v10 source is byte-identical to the repository.
- **Lab UI walk-through** (the real editor with a stand-in client): 18 checks pass, covering 0/3, the licence gate, refusals for non-WOFF2 and an HTML file, upload to 1/3, the duplicate message, 3/3, the 4th font refused, applying a font (canvas, current card, registered faces), the delete confirmation, refusal while used, a library font replacing the custom one, delete freeing a slot, uploading again, save with `fontRef` and the fallback, and Preview.
- **Regression against the previous build:**
  - 59 panel states are unchanged (the other eight panels at seven widths, and the Text panel at 390, 768 and 899px);
  - the 27-step behavior transcript is identical;
  - the accordion and curated-font checks pass;
  - live `@black` makes no font request and has no errors.
- **`npm run build`:** 1976 tests, 1975 passed, 0 failed, 1 skipped.

**Limits and not done.**

- The structural check cannot see inside WOFF2's brotli-compressed table data; browsers sanitize every web font (OTS) before use, and the file is only ever read as font data.
- WOFF2 only: there is no TTF / OTF conversion.
- **A real upload through the deployed gateway with a signed-in account was not performed by the agent,** because real accounts are protected and personas are never signed into. It is covered by the gateway tests and the live database checks above, and Mazen's acceptance test with his own account completes it.
- The Properties font menu shows a text's catalog fallback while a custom font is applied; the Text panel marks the custom font as current.

**TESTING delivery:** product `875bd2dfe6e194816500f262d7aedeabc14d0f58`, [workflow 39125819357](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39125819357) SUCCESS (full validation and the deployed-site smoke check passed). The 12 changed static files are byte-identical; migration `20261018120000` is applied; `usage-upload` v10 is active. Awaiting Mazen's acceptance.

## TTF and OTF upload (2026-10-18)

Mazen's task "GAMID — Custom Font Upload: Add TTF & OTF Support". Upload My Font now accepts **WOFF2, TTF and OTF**. What is stored is always a validated **WOFF2**, at most 2 MiB, so storage, quota, the 3-font limit, deduplication, the licence, RLS, deletion protection and visitor access are unchanged. **No migration and no new service, dependency or cost.**

**Runtime check before choosing.** The gateway runs on Supabase's Deno-based Edge runtime. Its `node:zlib` provides Brotli, which is what a WOFF2 needs, so no WOFF2 library or new service is required.

- `index.ts` loads it defensively: a runtime without it would refuse TTF / OTF (`FONT_CONVERSION_UNAVAILABLE`, 503) and keep everything else working.
- The new, data-free `GET usage-upload/capabilities` proves it live with a real compress, decompress and compare round on the server. On TESTING it answers `{"fonts":["woff2","ttf","otf"],"conversion":true}`.

**How a TTF / OTF becomes a WOFF2** (`supabase/functions/_shared/usage-upload.js`):

1. **One route.** `POST usage-upload/font` takes any format, up to 8 MiB, after the licence confirmation. **The format is read from the bytes:** `wOF2`, `00 01 00 00` / `true` (TTF) or `OTTO` (OTF). Collections (`ttcf`), WOFF 1 and everything else are refused (`INVALID_FONT_TYPE`).
2. **Source validation** (`validateSfnt`):
   - table count 1–64;
   - every table record inside the file and 4-byte aligned;
   - no overlapping or duplicate tables, and printable tags;
   - the required tables, with outlines matching the flavor (`glyf` + `loca`, or `CFF` / `CFF2` for `OTTO`);
   - a valid `head` magic number.
3. **Conversion** (`convertSfntToWoff2`). Every table is copied **byte for byte** into a WOFF2 using the format's **null transform** (transform version 3 for `glyf` / `loca`, 0 for the rest). It is Brotli-compressed in font mode by the runtime, at quality 9 (quality 5 above 2 MiB of source; quality 11 cost about 40× the CPU for 4–12% smaller files), and zero-padded to 4 bytes. **Nothing is interpreted or executed:** hinting programs, outlines and all other table content are only copied.
4. **Re-validation.** The result must pass `validateWoff2`, the same rule an uploaded WOFF2 meets, and fit in 2 MiB (`FONT_TOO_LARGE`).
5. **Store.** The stored file is named by **its own SHA-256**. Quota is reserved for the stored WOFF2, never the source; the source exists only in this request's memory (bounded to 8 MiB) and is never written anywhere. Re-uploading the same TTF gives the same WOFF2 (the conversion is deterministic), so it is stored once and uses no new slot.

**Tightened while doing this.** Chrome's decoder first rejected converted fonts that were not padded to 4 bytes. This showed that the reference decoder requires a WOFF2 to end exactly at its last block, zero-padded to 4 bytes. `validateWoff2` now enforces that rule too, so no data can ride after a WOFF2 even if its declared length covers it. All 19 real Google Fonts files still pass.

**Client and editor.**

- The picker offers `.woff2, .ttf, .otf`.
- The client sends every format to `usage-upload/font`, with quick checks for friendly messages only.
- The browser's own font check still gives the real preview before uploading.
- **New messages:** source over 8 MB, the converted font over 2 MB, unsupported type (collections, WOFF 1), conversion failed, conversion unavailable. A successful conversion says "converted from TTF to WOFF2".

**Validation.**

- **`tests/wall-custom-fonts-convert.test.js` (10 tests),** with genuine OFL fixtures in `tests/fixtures/fonts/`: **Imperial Script** (TTF, from Google Fonts) and **Source Sans 3** (CFF `OTTO` OTF, Adobe).
  - Format detection by bytes, including spoofed PNG / HTML / PDF files, `ttcf` and WOFF 1.
  - 14 malformed-source cases and the 8 MiB cap.
  - Conversion of both genuine fonts: valid WOFF2, smaller than the source, padded, flavor kept, null transforms, and **every table byte-identical after decompression**.
  - Deterministic output; fail-closed without Brotli or on Brotli errors; over 2 MiB refused.
  - **Gateway `font` route:** only the WOFF2 is reserved, stored and registered, named by its SHA-256. A WOFF2 is stored unchanged. HTML declared as `font/ttf` is refused before reservation. Size, licence, conversion-unavailable, malformed, limit and quota refusals store nothing. Duplicates store nothing. `capabilities` works.
- **Chrome's own WOFF2 decoder and font sanitizer** (FontFace) accept both converted fonts, which render **pixel-identical** to the original TTF / OTF at the same text widths.
- **Lab UI:** the picker offers the three formats; an HTML file named `.ttf` and a `.ttc` file are refused; genuine TTF and OTF uploads say "converted"; a TTF-sourced font draws on the canvas. The 18-step My Fonts walkthrough passes.
- **Regression against the previous build:** 59 panel states unchanged, and the 27-step behavior transcript is identical.
- **Live on TESTING:** `usage-upload` **v12** is active and its downloaded source is byte-identical to the repository (v10 was first confirmed to match the previous repository version). `capabilities` proves the server-side Brotli round trip; an unauthenticated TTF upload gets 401 and a foreign origin 403.
- **`npm run build`:** 1986 tests, 1985 passed, 0 failed, 1 skipped.

**Limits.**

- **Real conversion untested live:** a real conversion through the deployed gateway needs a signed-in owner. The agent does not sign into accounts, so this is Mazen's acceptance step. The server's Brotli is proven live, and the conversion code is the tested shared module.
- **No glyph transform:** the null transform does not apply WOFF2's glyph transform, so a converted TTF is somewhat larger than a WOFF2 made by Google's `woff2_compress` (Imperial Script: 66.9 KB vs 64 KB at quality 11). An uploaded WOFF2 is stored as it is.
- **Large sources:** very large sources (several MB) use faster compression; a source whose WOFF2 would exceed 2 MiB is refused.
- **Same font, different formats:** a WOFF2 and a TTF of the same font are different files, so they are not deduplicated against each other.

**TESTING delivery:** product `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`, [workflow 39127878054](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39127878054) SUCCESS; `usage-upload` v12. Awaiting Mazen's acceptance.

## Text panel order (2026-10-18)

Since `5a5a312`, the desktop Text panel runs Add Text, Font Library, Text Effects, My Fonts, then Upload My Font at the very bottom, with shorter upload copy and the same rules. My Fonts therefore now sits below the library. See `docs/WALL-EDITOR-TEXT-EFFECTS.md` (`PROJECT_HANDOFF.md` §85).
