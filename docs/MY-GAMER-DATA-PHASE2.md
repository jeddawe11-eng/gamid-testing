# My Gamer Data, Phase 2: Classic → Wall import foundation

This covers Mazen's task "GAMID — MY GAMER DATA — PHASE 2 — Dynamic Classic-to-Wall Import Foundation" (2026-10-19, TESTING only).

**Status (2026-10-19):** Mazen approved the database gate. Both migrations are **APPLIED on TESTING** and the frontend is **deployed** (`fe77637`, run `39254434384`). It is **PENDING Mazen's manual acceptance**; see §9. Sections 4–6 below are the proposal as it was approved.

The design follows `docs/CLASSIC-WALL-IMPORT-AUDIT.md` §6 and §9. It builds on Phase 1 (`docs/WALL-EDITOR-DESKTOP-REDESIGN.md`, *My Gamer Data panel*).

## 1. Architecture: one contract on the existing section registry

The core rule is simple. Classic stays the source; the Wall stores only **references** (section key + optional stable item id) and resolves them every time it is drawn.

| Layer | What it is | Where |
|---|---|---|
| **Registry** | `public.public_section_catalog`, extended. It is not a new registry. | migration `20261019120000_gamer_data_sections.sql` |
| **Projection** | `private.gamer_data_items(section, handle, owner)`: one branch per importable section, built **only** from the reads Classic already uses. It has two outputs: `get_public_gamer_data(handle)` (anon) and `get_my_gamer_data()` (owner). | same migration |
| **Wall binding** | the `gamidData` field `section`: `{ section, item?, text? }` (one item) or `{ section, style?, layout? }` (whole section) | migration `20261019120100_wall_gamer_data_binding.sql` + `dist/wall-kit/gamid-data.js` |
| **Generic painter** | presentations `text` / `facts` / `chips` / `cards` / `stat`, drawn with the GamID block's look and style options | `dist/wall-kit/gamid-blocks.js` `paintGamidSection` |
| **Library** | catalog sections are **discovered** from the projection and placed by catalog sort order among the specialised Phase 1 sections | `dist/wall-editor/tools.js` `sectionChoices` / `librarySections` |

Why this design:
- **No duplicated section list.** A new eligible section is registered **once**, in one migration: its catalog row plus its projection branch, which is its privacy contract. It then appears in the import library with no Wall menu entry, no Wall renderer and no validator change, as long as it fits a generic presentation. A catalog row **without** a projection branch exposes nothing.
- **Privacy stays in the database, where Classic's already is.** The visitor projection calls only:
  - `get_public_profile_extras_impl`: a PUBLIC SOLO GamID, with the three About Me switches;
  - `get_public_favorite_games_impl`: a PUBLIC SOLO GamID, with the My Games gate.

  A visitor can therefore never get more than Classic shows. Private flags exist only in the owner projection and are stripped from the visitor shape (`normalizeGamerData`).
- **The validator checks format only.** The `wall_drafts` and `wall_publications` CHECK constraints call the validator, so it cannot read a table. Whether a section is offered and visible is decided at draw time. A retired section therefore draws nothing (visitor) or a diagnostic (owner); it never makes a saved Wall invalid.
- **The owner's switch list does not change.** A new `visibility_switch` column keeps "Show on my GamID" to exactly its four rows. The two wall-only rows are `INVALID_SECTION` for `set_my_section_visibility`.
- **Specialised sections keep their renderers.** These are Profile, Roles, My Games, Connections, My Duo and My Crews.

**What cannot be automatic:** a section that needs new interaction (a player, navigation, media leases) still needs its own renderer. The data contract (catalog row + projection branch + privacy rule) is always required.

## 2. The contract (generic shape)

```
[{ key, label, icon, presentation: text|facts|chips|cards|stat, single, all, order, item_label,
   items: [{ id, kind: text|chips|card|stat, label, value? | values? | title?, sub?, private? (owner only) }] }]
```

Normalisation (`dist/wall-editor/gamid-data.js` `normalizeGamerData`) keeps only this shape:
- **Dropped:** an unknown presentation, an unsafe key, a section with no import mode, an invalid or duplicate id, an empty value.
- **Bounded:** 40 sections, 60 items, 30 chips.
- **Replaced:** an unknown icon becomes the generic icon.

## 3. First sections

| Section | Catalog | Items (stable id) | Public gate (unchanged, reused) |
|---|---|---|---|
| **About Me** | `about_me`, facts, single + all, order 30 | `location`, `member_since` (formatted as Classic does, e.g. "3 October 2026"), `languages` (chips), `genres` (chips) | Location, Languages and Genres each have their own switch; Member Since follows the published GamID |
| **Favorite Games** | `favorite_games`, cards, single + all, order 40 | catalog `game_key`, in the owner's order, with the title and release year | the My Games switch (`public_my_games_allowed`) on a published GamID |

**Library:**
- About Me offers the **About Me Card** and then each fact.
- Favorite Games offers **One Favorite Game** (a picker by `game_key`) and **All Favorite Games**.
- Both sections are closed by default.
- Each choice is listed once.

**Sync:**
- A collection always draws Classic's current list and order.
- A single item is bound by id. If it is removed, it is **not replaced**:
  - the owner sees "This is no longer in your Favorite Games.";
  - visitors see nothing.
- Refresh from Classic reloads the projection with the other reads.
- Geometry and style are never touched.

## 4. Exact proposed migrations (not applied)

- `supabase/migrations/20261019120000_gamer_data_sections.sql`:
  - catalog columns and constraint, plus two rows;
  - `get_my_section_visibility_impl` / `set_my_section_visibility_impl` copied verbatim, plus `visibility_switch`;
  - the projection functions and their grants.
- `supabase/migrations/20261019120100_wall_gamer_data_binding.sql`: `private.wall_gamid_data_errors`, copied verbatim plus the `section` branch.

**Objects affected:**

| Kind | Objects |
|---|---|
| Table | `public.public_section_catalog`: 7 columns, 1 check constraint, 2 rows |
| Replaced (same signature, same grants) | `private.get_my_section_visibility_impl()`, `private.set_my_section_visibility_impl(text, boolean)`, `private.wall_gamid_data_errors(jsonb)` |
| New | `private.gamer_data_items(text, text, boolean)`, `private.gamer_data_projection(text, boolean)`, `private.get_public_gamer_data_impl(text)`, `private.get_my_gamer_data_impl()`, `public.get_public_gamer_data(text)`, `public.get_my_gamer_data()` |
| Grants | anon + authenticated: `get_public_gamer_data` (+ impl). authenticated: `get_my_gamer_data` (+ impl). The per-section and projection internals: **no grant** |

No policies change. No table data changes except the two catalog rows.

## 5. Verification done (nothing persisted)

- **Isolated Postgres (PGlite, `tests/wall-gamer-data-db.test.js`, 6 tests).** Run on the real catalog migration plus the proposed one. It covers:
  - the switch list is unchanged;
  - the catalog constraints;
  - owner vs visitor projections;
  - every privacy switch;
  - reorder, add and remove;
  - a GamID that is not public;
  - discovery only with a projection branch;
  - inactive and non-importable rows;
  - no cross-owner leak;
  - grants.
- **Rolled-back rehearsal on TESTING (`tests/integration/wall-gamer-data-db.sql`).** The migrations plus the test run in one transaction that always aborts. Disposable identities (`zgd…`) are used against the **real** About Me, Favorite Games, visibility and validator functions. **23 / 23 pass.** The checks include:
  - every existing Wall draft and publication is still valid;
  - visitor values equal Classic's own public reads;
  - no `private` flag reaches anon;
  - My Games off hides Favorite Games;
  - anon cannot call the owner projection or the internals.

  Afterwards, TESTING was confirmed unchanged: 0 new columns, 0 new functions, 0 test users or entities.
- **Shared corpus (`tests/wall-w2-corpus.js`, +16 section cases).** The database validator returns the same error set as the JS validator for **all 643** documents (rehearsal).
  - Five other steps of that contract test fail, **identically without these migrations**. These are storage-RLS counts and font references that the test predates.
  - This is a pre-existing staleness of `tests/integration/wall-w2-db.sql`, proposed as a Product Memory issue.
- **Performance.** Anon `get_public_gamer_data` averages about **9.8 ms** of database time per call (50 calls; Classic's two reads together take about 2.7 ms; an unknown handle about 0.1 ms).
  - A visitor's Wall makes the call **only if it binds a section** (`usesGamerSections`).
  - The editor adds one owner read on load and on Refresh.

## 6. Rollback / recovery

The frontend tolerates the RPCs being absent (`sections: []`), so the database can be rolled back on its own.

**Before rolling back the binding**, check that no saved Wall binds a section; remove those elements first:

```sql
select count(*) from public.wall_drafts where jsonb_path_exists(document, '$.stages[*].elements[*] ? (@.type == "gamidData" && @.payload.field == "section")');
select count(*) from public.wall_publications where jsonb_path_exists(document, '$.stages[*].elements[*] ? (@.type == "gamidData" && @.payload.field == "section")');
```

**Then:**
1. Re-run the `private.wall_gamid_data_errors` block of `20260930160000_wall_video_layers_other_link.sql`.
2. Drop the new functions:
   ```sql
   drop function public.get_my_gamer_data(), public.get_public_gamer_data(text), private.get_my_gamer_data_impl(),
     private.get_public_gamer_data_impl(text), private.gamer_data_projection(text, boolean), private.gamer_data_items(text, text, boolean);
   ```
3. Re-run the two `*_section_visibility_impl` blocks of `20260920190000_steam_connection_foundation.sql`.
4. Remove the two catalog rows:
   ```sql
   delete from public.public_section_catalog where section_key in ('about_me', 'favorite_games');
   ```
5. Drop the constraint and the seven columns:
   ```sql
   alter table public.public_section_catalog drop constraint public_section_catalog_wall_check,
     drop column wall_item_label, drop column wall_all, drop column wall_single, drop column wall_icon,
     drop column wall_presentation, drop column wall_importable, drop column visibility_switch;
   ```

## 7. Not in this phase

- Education & Work, the Games count, My Socials (live), Banner, One Crew and Connected-game cards.
- Favorite-game artwork on the Wall cards (the cards are text; the artwork provider permission is still outstanding).
- Mobile and tablet changes.

## 8. After approval (not yet authorised)

1. Apply both migrations to TESTING.
2. Run `tests/integration/wall-gamer-data-db.sql` alone.
3. Deploy the frontend.
4. Live-check the library (About Me, Favorite Games), save and publish, and the visitor view, on synthetic fixtures.
5. Update GamID Truth (a new capability, PENDING_ACCEPTANCE), the docs and PROJECT_STATE.

## 9. Applied and deployed (2026-10-19)

- **Migrations:** `20261019120000_gamer_data_sections` and `20261019120100_wall_gamer_data_binding` were applied together in one transaction, then recorded with `supabase migration repair --status applied`. The migration history lists both.
- **Live database checks (each in a rolled-back transaction):**
  - `tests/integration/wall-gamer-data-db.sql`: **23 / 23**, including every existing Wall draft and publication still valid.
  - `wall-publishing-db.sql`: 42 / 42.
  - `wall-w2-db.sql`: the database validator equals the JS validator on all **643** corpus documents. 3 steps fail, all from the pre-existing set reported before (wall-video storage visibility counts, custom-font references); they were not changed.
  - `public-section-visibility-db.sql`: its registry step read the catalog table directly. It now pins the four switch rows through `visibility_switch`, plus the two Wall-only rows (`fe77637`). One leak-pattern step fails with or without these migrations: the pattern `FOUND` matches the role label "Game Studio Founder" (a false positive from the role catalog, 20261011200000). It was reported, not changed.
- **Frontend:** `fe77637` deployed by run `39254434384`. The 12 changed served files match the commit byte for byte.
- **Live checks (no credentials):**
  - The anonymous `get_public_gamer_data` for @black and @zshot equals Classic's own public reads: the same facts and values, the same favorites in the same order, and no private flag.
  - Anonymous calls to the owner projection are refused (401); the internal functions are not reachable (404).
  - The owner projection for the synthetic fixture GM-TEST-01 (impersonated, rolled back) works, and its switch list is unchanged.
  - @zshot's published Wall (3 stages, 4 GamID elements, no section binding) draws every element on desktop and phone, with no page error and no call to the new projection.
  - The signed-out Wall Editor shows its normal sign-in gate.
- **Not verified by the agent:** the signed-in editor (library, Refresh, save, publish). It needs the owner's own sign-in; see Mazen's checklist in `PROJECT_HANDOFF.md` §96.

## 10. Favorite Games Display Style (2026-10-19): applied and deployed, PENDING acceptance (as first proposed below; final state in §11)

Mazen's task "GAMID — FAVORITE GAMES DISPLAY STYLE". The code is committed on the feature branch. It is **not deployed**, because a database change is strictly necessary (below). TESTING still serves `fe77637`.

- **What it does:**
  - On desktop, Properties of a Favorite Games element (All or One) has **Display Style: Names Only | Game Covers**, a `selectField` like Media & Links "Show as".
  - Each element keeps its own choice in an optional `display` key ("names" is the default and is never stored, so every existing element is unchanged).
  - Switching changes only that key: never the box, rotation or style.
- **Game Covers:**
  - One 2:3 cover card per game, in Classic's order, with the name below (up to two lines).
  - `coverLayout()` picks the column count that gives the largest covers fitting the element's width **and** height, so there is no overflow, stretching or cut title.
  - A game without artwork, or an image that cannot load, keeps an initials tile.
  - One Favorite Game shows one card whose name takes the element's own font and colour.
- **Classic's mechanism, reused unchanged:**
  - The cover tiles carry `data-game-cover="<game key>"`. Classic's `applyGameArtwork` (`dist/public/game-artwork.js`) picks the portrait cover, checks the provider-CDN address, and adds a lazy, no-referrer image that removes itself on error.
  - Artwork comes from GamID's existing `game-artwork` function: `/owner/self` in the editor (`getMyGameArtwork`, as Classic's owner preview) and `/<handle>` for visitors (`fetchGameArtwork`, as the public Classic profile).
  - It is read **once per page, and only when a Game Covers element is painted** (`dist/wall-kit/gamid-artwork.js`). Refresh from Classic asks again. On a visitor's Wall, covers fill in place without repainting the Wall.
  - The visitor page reads artwork only if its Wall shows covers (`usesGamerCovers`).
- **Privacy:** covers are drawn only for the items the projection already returned, so visitors still see Favorite Games only while My Games is public. The artwork function's own public gate is unchanged.
- **Generic:** the section catalog says which sections hold games with artwork (`wall_artwork = 'game'`, Favorite Games). The editor names no section and offers Display Style only where the catalog says so.
- **Proposed migrations (NOT applied):**
  - `20261019140000_gamer_data_artwork.sql`: the catalog column `wall_artwork` (check `'game'`), set for `favorite_games`; `private.gamer_data_projection` copied verbatim plus the `'artwork'` field. No grant changes.
  - `20261019140100_wall_gamer_data_display.sql`: `private.wall_gamid_data_errors` copied from `20261019120100` plus the optional `display` key (names | covers, otherwise `INVALID_DATA_DISPLAY`).
  - **Why they are needed:** the drafts and publications CHECK constraints call the server validator, which refuses unknown keys. Without the second migration, saving a Game Covers element fails.
  - **Rollback:**
    1. Check that no saved Wall uses `display`.
    2. Re-run the validator block of `20261019120100` and the projection block of `20261019120000`.
    3. Drop the `wall_artwork` column.
- **Editor CSP: a decision for Mazen.** The Wall editor's CSP is `img-src 'self' data: blob:`, and a guard test pins "no provider image host added" (`tests/wall-round2-posters.test.js`). The editor canvas and Preview therefore show the initials fallback instead of covers, while visitors (the public page has no CSP) see the covers. The options:
  - (a) Add `https://cdn2.steamgriddb.com` to the editor's `img-src`. This is the CDN Classic's own pages already load from, and it means updating that guard deliberately.
  - (b) Keep the editor text-only: covers are visible only to visitors.
  - (c) Serve covers through GamID's own image proxy: a new function route, more scope.
- **Guard change:** the editor import-route guard (`tests/wall-w3-editor.test.js`) gains one named exception, `dist/public/game-artwork.js`, beside the two existing ones. This is so the kit reuses Classic's artwork code instead of copying a provider rule (the kit may not name a provider).
- **Validation:**
  - 2043 tests, lint and typecheck;
  - Display Style unit tests 5 / 5;
  - PGlite 7 / 7;
  - rolled-back TESTING rehearsal of both migrations: gamer-data 25 / 25, corpus parity 649 / 649, the same 3 pre-existing `wall-w2-db.sql` failures; TESTING was verified unchanged afterwards;
  - lab browser checks 24 / 24: Names Only pixel-identical to `fe77637`, no artwork read for Names Only, covers in order with fallback, fit and 2:3, geometry unchanged, per-element style, persistence, Preview, Refresh, visitor, My Games private, artwork off, phone and tablet pixel-identical;
  - Phase 2 regression 34 / 34.

## 11. Display Style: applied and deployed (2026-10-19)

Mazen authorized both migrations and **CSP option A**.

- **Migrations:** `20261019140000_gamer_data_artwork` and `20261019140100_wall_gamer_data_display` were applied in one transaction and recorded with `migration repair`.
- **Live database checks (each rolled back):**
  - gamer-data: 25 / 25;
  - publishing: 42 / 42;
  - validator parity: 649 / 649;
  - the known older failures only: `wall-w2-db.sql` 3 steps; `public-section-visibility-db.sql` the "Game Studio Founder" false positive.
- **CSP:** the editor's `img-src` is now exactly `'self' data: blob: https://cdn2.steamgriddb.com`, with every other directive unchanged. The guard `tests/wall-round2-posters.test.js` was updated deliberately: exactly this one new origin is allowed, and no embed provider image host.
- **Title fit:** checking with real TESTING data showed "Call of Duty 4: Modern Warfare" cut on two lines. The name font now shrinks until the longest name fits on two lines (`coverLayout` `longest`; `e686d7f`).
- **Deployed:** `a061f27` (run `39261023816`), then `e686d7f` (run `39261690232`). The served files match the commit.
- **Live checks on TESTING (anonymous, read-only):** in the deployed Wall editor page, under its real CSP, the deployed Wall code painted @black's real Favorite Games from the public projection and Classic's visitor artwork route.
  - Names Only matches the Phase 2 drawing.
  - Game Covers drew 4 cards plus a single-game card, with 5 / 5 covers loaded, all from `cdn2.steamgriddb.com`, lazy and with no referrer.
  - Every name fits; every card stays inside its element.
  - An image from a non-approved host (`i.ytimg.com`) is still blocked by the CSP.
  - @zshot's published Wall (no covers) draws its 4 GamID elements with no artwork request and no error.
- **Not verified by the agent:** the signed-in editor (Properties, Save, Refresh with the owner's own artwork read). It needs the owner's own sign-in; see the checklist in `PROJECT_HANDOFF.md` §98.