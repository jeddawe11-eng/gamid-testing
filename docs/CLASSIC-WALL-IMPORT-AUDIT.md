# Classic → My Wall: complete data import audit (AUDIT & DESIGN ONLY)

Mazen's task "GAMID — CLASSIC → MY WALL COMPLETE DATA IMPORT AUDIT" (2026-10-19). Nothing here is implemented: no code, schema, deployment, Truth or Product Memory change. Every statement below was verified in the repository at `973ed26` unless it is marked **Proposed**.

## 0. The two facts that shape everything

1. **The Wall replaces Classic for visitors.** With a published, enabled Wall, `/@handle` draws the Wall and never builds the Classic profile (`dist/public/public.js:422-426`: the desktop profile is created only `if (!wall)`). Whatever the Wall cannot import is therefore **invisible to visitors** of a player who uses My Wall.
2. **Wall data elements already store bindings, never copies.**
   - `gamidData` stores `{ field, ref?, style }` (`dist/wall-kit/gamid-data.js:1-10, 19`) and `gamid` stores `{ block, display options }` (`dist/wall-kit/gamid.js:1-12`).
   - The data is resolved each time the Wall is drawn: for visitors only from the anonymous public view (`dist/wall-editor/gamid-data.js:111` `loadPublicView`, used by `dist/public/public-wall.js:65`); in the editor from the owner's own reads (`dist/wall-editor/gamid-data.js:182` `loadGamidSnapshot`).

   Live sync and privacy are therefore already right **for what exists**. The gap is coverage, plus a hard-coded, per-feature list on both sides.

## 1. Verified Classic feature inventory

Public data sources (all anonymous, all gated on a PUBLIC SOLO GamID):

| Source | Definition |
|---|---|
| `get_public_identity` → `private.get_public_identity_impl` | `supabase/migrations/20261003234309_personal_gamid_crews.sql:3` |
| `get_public_profile_extras` | `20261011100000_classic_profile_consolidated.sql:196` |
| `get_public_favorite_games` | `20261011180000_favorite_games.sql:68` |
| `get_public_social_links` | `20261009151000_my_socials_link_engine.sql:13` |
| `get_public_discord_card` | `20261009190000_discord_profile_card.sql:67` |
| `get_public_my_games` | paged library |
| `get_public_crews` | the full Crew directory |
| Banner | through the visitor-media lease (`publicBannerUrl`) |

| # | Classic section | Authoritative data | Public gate (verified) | Where Classic draws it |
|---|---|---|---|---|
| 1 | **Banner** | Profile Banner object | `has_banner` + media lease | `public-desktop.js` hero |
| 2 | **Avatar** | `entities.avatar_media_reference` | published GamID | hero |
| 3 | **Display name** / **@GamID** | `entities` | published GamID | hero |
| 4 | **Bio** | `profiles.bio` | published GamID | hero |
| 5 | **Gaming roles** (+ primary) | `profile_gaming_roles`, `gaming_role_catalog` | published GamID | hero badges |
| 6 | **Education & Work** | `profiles.education_work_*` | `show_education_work` switch | hero line |
| 7 | **Games count** stat | My Games `library_count` | My Games switch | hero stat → My Games |
| 8 | **About Me** – Location | `about_location_text` | `show_about_location` | About Me |
| 9 | **About Me** – Member Since | `entities.created_at` (date) | always | About Me |
| 10 | **About Me** – Languages | `profiles.about_languages` + catalog | `show_about_languages` | About Me chips |
| 11 | **About Me** – Favorite Genres | `profiles.about_genres` + catalog | `show_about_genres` | About Me chips |
| 12 | **Favorite Games** (≤ 4, ordered) | `profiles.favorite_games` ∩ library | **My Games switch** (`public_my_games_allowed`) | below the hero (`public-desktop.js:158`, `public.js:463`) |
| 13 | **My Games** library (+ playtime, ranks & stats scopes) | Steam discovered + manual games | My Games / playtime / stats switches | My Games |
| 14 | **Connected Games** (League card, rank) | `league_profiles` | `is_public` + stats scope | desktop sidebar (`public.js:434`) |
| 15 | **Discord / Steam** connection sections | `gaming_connections` | per-row `is_public` | mobile / sidebar (`public.js:62-79`) |
| 16 | **My Socials** (12 platforms) | social links | published GamID | panel lead (`public.js:371`) |
| 17 | **Discord Profile Card** | Discord connection | its own opt-in | on the Discord social icon |
| 18 | **My Duo** | `identity_relationships` (accepted, shown, Duo published) | owner switch | sidebar |
| 19 | **My Crews** | `crew_members` + published Crew Walls | automatic | sidebar entry + directory |
| — | Intro | Intro derivative | published GamID | **page-level** (plays before Classic or the Wall), not a section |
| — | Play Together | – | **no public projection** | not public: not eligible |

## 2. Current Wall import inventory (verified)

The GamID tool offers two parallel lists (`dist/wall-editor/tools.js:733` blocks, `:744` data):

| Kind | Options |
|---|---|
| **GamID blocks** (`gamid.js:12`) | `profile`, `roles`, `games`, `connections`, `duo`, `crews` |
| **GamID data** (`gamid-data.js:19`) | `avatar`, `displayName`, `handle`, `bio`, `role` (one, or "@primary"), `game` (one), `connection` (one), `roles` (all), `games` (all), `connections` (all) |

- **Duplication today:** Roles / Games / Connections exist **twice** (as a block and as a data collection with "exactly the GamID block's options").
- **Hard-coded lists:** the lists are hard-coded in JavaScript **and** in the database validator (`private.wall_element_payload_errors`, latest `20261012120000_wall_icons.sql:126`: `block not in ('profile', 'roles', 'games', 'connections', 'duo', 'crews')`).
  - My Duo and My Crew each needed a migration only to add their block name (`20261002150000_my_duo.sql:519`, `20261004100000_wall_crews_block.sql:63`).
  - **No new section can reach the Wall today without code + migration + deployment.**

## 3. Gap matrix

Legend:
- **✓** implemented
- **◐** partial
- **✗** missing
- **—** not applicable

| Classic section | Data source | Wall support | Single / All | Live | Privacy on the Wall | Missing capability | Recommendation |
|---|---|---|---|---|---|---|---|
| Avatar | identity | ✓ data `avatar` | single | ✓ | ✓ public view | – | keep |
| Display name, @GamID, Bio | identity | ✓ data fields | single | ✓ | ✓ | – | keep |
| Gaming roles | identity | ✓ data `role` / `roles`, block `roles` | both | ✓ (`@primary` follows the primary) | ✓ | duplicate entry points | merge into one "Gaming Roles" group |
| Profile card | identity | ✓ block `profile` | all | ✓ | ✓ | – | keep as a ready-made card |
| **Banner** | media lease | ✗ | – | – | – | no live image binding | Proposed: "Banner" as a live image (needs a visitor read through the existing lease) |
| **Education & Work** | identity (switch) | ✗ | – | – | – | field | Proposed: text field, hidden when the switch is off |
| **Games count** | My Games | ✗ (count only inside the Games block) | single | – | – | field | Proposed: "Games count" stat |
| **About Me** (Location / Member Since / Languages / Genres) | `get_public_profile_extras` | ✗ | – | – | – | **the Wall never calls this RPC** | Proposed: one "About Me" group: each fact as text, Languages / Genres as chips, plus an "About Me card" |
| **Favorite Games** | `get_public_favorite_games` | ✗ | – | – | – | **the Wall never calls this RPC** | Proposed: "Favorite games" (all 4, in order) + "One favorite" (by game key); gated like Classic (My Games switch) |
| My Games library | `get_public_my_games` | ✓ data `game` / `games`, block `games` | both | ✓ | ✓ (playtime / stats scopes) | duplicate entry points; a single game binds by **name** (`gameRef`), so a catalogue rename breaks it | merge into one group; Proposed: bind new items by `game_key` |
| Connected Games (League) | identity `league` | ◐ only as a row of Connections (with its rank line) | – | ✓ | ✓ | no game card like Classic's | Proposed: "Connected games" group (card per game) |
| Discord / Steam / League connections | identity | ✓ data `connection` / `connections`, block `connections` | both | ✓ | ✓ | duplicate entry points | merge into one group |
| **My Socials** | `get_public_social_links` | ✗ live (Media & Links can paste the same links, as **copies**) | – | – | – | live binding | Proposed: "My Socials" live icons (one / all), reusing the Icon Group painter |
| **Discord Profile Card** | `get_public_discord_card` | ✗ | – | – | – | – | later: on the live Discord icon, as on Classic |
| My Duo | identity `duo` | ✓ block `duo` | all (one Duo) | ✓ | ✓ | – | keep |
| My Crews | identity `crews` | ◐ block `crews` | all | ✓ | ✓ | **one Crew** | Proposed: "One crew" (by `crew_id`) |
| Intro | page-level | — | — | — | — | — | not an import (it already plays before the Wall) |
| Play Together | none public | — | — | — | — | — | not eligible |

**Summary (the 19 inventory rows):** 7 have full live Wall support (Avatar, Display name / @GamID, Bio, Gaming roles, My Games, Discord / Steam connections, My Duo); 2 are partial (Connected Games only as a Connections row; My Crews only as all, no single crew); **10 are missing**: Banner, Education & Work, Games count, Location, Member Since, Languages, Favorite Genres, **Favorite Games**, My Socials (live) and the Discord Profile Card.

## 4. Missing or incomplete imports (priority order)

1. **Favorite Games:** a recent, visible Classic section with no Wall path at all. The data is already public, small (≤ 4) and ordered.
2. **About Me** (Location, Member Since, Languages, Favorite Genres): public through `get_public_profile_extras`, which the Wall never reads.
3. **My Socials (live):** today only as pasted copies, which go stale when the owner edits My Socials.
4. **Education & Work** and the **Games count** stat.
5. **One Crew**, and **Connected Games** as cards.
6. **Banner** as a live image.

## 5. Live synchronisation: existing vs missing

| Requirement | Today | Gap / proposal |
|---|---|---|
| A Classic change updates linked Wall content | ✓ for every binding (resolved at draw time) | the **editor** loads the snapshot once (`editor.js:497`): reload, or Proposed refresh on focus / visibility |
| Adding an item updates an imported collection | ✓ (roles / games / connections / crews read the current list) | – |
| A new eligible section appears in the import library | ✗ (hard-coded lists in JS + SQL) | §6 registry |
| Removing an item never lets another replace it | ✓: bound by key; a removed item shows "no longer available" to the owner (`gamid-data-paint.js:31-41`) and **nothing** to visitors | `@primary` deliberately follows the primary role; a game bound by name can break on a catalogue rename (use `game_key`) |
| Privacy changes apply immediately | ✓ visitors use only the server-filtered public view on each visit | an already-open visitor page updates on reload (as Classic) |
| Position, size, styling and effects unchanged | ✓: the element keeps its geometry and style; only the value changes | – |
| Old Walls stay compatible | – | every proposal is additive (new optional keys, old payloads valid) |
| Visitors get current permitted data | ✓ | – |
| No duplicate data or uploads | ✓: no copies stored; media through existing leases | – |

## 6. Proposed automatic section discovery (design, not implemented)

**Reuse what exists.** `public.public_section_catalog` (`20260920140000_public_section_visibility.sql:23`) is already described in its own migration as the "Section registry (small, extensible: a future game adds a row here)".
- It currently lists only the four switchable sections (discord, steam, league, education_work) and is private to the visibility RPCs.
- The section definitions are otherwise duplicated four times: the server projection, the Classic renderer (`public.js`, `public-desktop.js`, `public-mobile.js`), the owner preview copy (`dist/account/classic-profile-source.js:12`) and the Wall (`gamid-data.js` / `gamid.js` + SQL).

**Proposed contract:** extend the existing catalog rather than add a platform.

1. **Catalog row per section:**
   - `section_key` (stable id), `label`, `icon` key, `sort_order`;
   - `section_kind` (PROFILE / GAME / CONNECTION / SOCIAL / RELATION);
   - `wall_importable` (boolean);
   - `presentation`: one of a small fixed set of **generic shapes**:
     - `text` (one value),
     - `facts` (label / value pairs),
     - `chips` (labelled list),
     - `cards` (title / sub / optional image, optional link),
     - `stat` (number + label);
   - `item_key` (which field identifies one item, for "one item");
   - `supports_single` / `supports_all`.
2. **One anonymous projection:** `get_public_gamer_data(handle)` returns `[{ key, label, icon, presentation, items: [{ id, … approved fields }] }]` for **visible** sections only.
   - It is built from the existing gated functions (`get_public_identity_impl`, extras, favorites, social links), so **privacy stays in the database**, where it already is.
   - The owner variant applies the same projection plus a "private" tag for the editor.
3. **One generic Wall binding:** a new optional `gamidData` field (e.g. `{ field: "section", section, item? }`).
   - The SQL validator checks `section` **against the catalog** (data-driven), so a new section needs **no Wall migration**.
   - Existing fields and blocks stay valid and unchanged.
4. **Generic renderers** draw `text` / `facts` / `chips` / `cards` / `stat` with the existing Text and GamID-block styling. Sections that need behaviour keep **specialised renderers**:
   - My Games (paging, Game Details);
   - Connections (actions, rank lines);
   - My Duo / Crews (navigation);
   - My Socials (icon painter);
   - Banner (media lease).

**What can and cannot be automatic.** A future section is discovered automatically **only if** it ships its projection and catalog row and fits a generic shape. It then appears in the import library with single / all, live, privacy-safe, with no Wall code.

A section that needs new interaction (a player, a link destination, media) needs its own renderer. No architecture can promise that every future feature works with zero code; the data contract (projection + privacy rule) is always required.

## 7. Proposed desktop experience (design, not implemented)

- **Naming:** the tool is named **My Gamer Data**, and its panel heading is **Import from Classic**.
- **Groups:** accordion groups in the accepted style (the font-library heading: name, count, chevron), one per Classic section that has public data. They follow Classic's own order and are hidden when the section is empty or private:

| Group | Options |
|---|---|
| **Profile** | Avatar · Display name · @GamID · Bio · Profile card · *Banner* · *Education & Work* |
| **Gaming Roles** | All roles · One role (incl. "My primary role") |
| **About Me** | *About Me card* · *Location* · *Member Since* · *Languages* · *Favorite Genres* |
| **Favorite Games** | *All favorites (in order)* · *One favorite* |
| **My Games** | All games · One game · *Games count* |
| **Connected Games / Connections** | All connections · One connection · *Connected game cards* |
| **My Socials** | *All socials (icons)* · *One social* |
| **My Duo** | Duo card |
| **My Crews** | All crews · *One crew* |

  (*italic* = proposed, not yet available.)

- **One entry per option:** each option appears once, so the block / data duplication of Roles, Games and Connections ends. The existing elements stay valid; only the library shows one entry each.
- **Clear status:** "One …" options show the owner's current items in a picker, as today. A group whose section is not public shows a "Not on your GamID" tag (the editor already knows this, `gamid-data.js:240`).
- **Element marker:** an imported element is marked in Layers with its group icon. Its Properties keep today's controls in the accepted accordion.
- **Scope:** desktop only in this phase; the phone panel is unchanged.

## 8. Implementation phases, dependencies, risks

| Phase | Scope | Database | Risk |
|---|---|---|---|
| **1. UI only** | Rename to My Gamer Data / Import from Classic; accordion groups by existing section; one entry per option (merge the duplicates); Not-on-GamID tags; editor refresh on focus | none | low; mobile untouched |
| **2. Missing fields with existing public RPCs** | Favorite Games (all / one), About Me (card + facts + chips), Education & Work, Games count, One Crew, Connected game cards | **additive** Wall validator migration (new fields / blocks), as Duo / Crew did | medium: shared corpus + DB parity needed; reads two more anonymous RPCs per Wall view |
| **3. Registry + generic binding** | Catalog columns, `get_public_gamer_data`, generic `section` field, data-driven SQL validator, generic renderers; later Classic consumes the same projection (retires `classic-profile-source.js` duplication) | new projection RPC + catalog columns + validator change | high: touches the public boundary; must be rehearsed and reviewed for privacy |
| **4. Live socials + Banner** | My Socials live icons, Banner live image (media lease) | depends on Phase 3 | medium: media lease reuse |

**Dependencies:**
- Phase 2 can proceed without Phase 3, but each new field then repeats the per-feature pattern.
- Phase 3 is what makes future sections automatic.

**Main risks:**
- privacy regressions at the public boundary (mitigated by keeping every gate in SQL and testing anonymous reads);
- game bindings by name (switch new ones to `game_key`);
- one extra round-trip per Wall view (batch in Phase 3).

## 9. Decisions for Mazen

1. **Order:** Phase 1 (UI) and Phase 2 (fill the gaps) first, or go straight to Phase 3 (registry)?
2. **The 10 missing sections:** which to import: all, or which first? My recommendation is Favorite Games, then About Me, then My Socials.
3. **Duplicate options:** may the library show **one** entry per option, hiding the duplicate block / data entries? Existing elements stay as they are.
4. **New bindings:** may new game bindings use `game_key` (stable) instead of the game name? Existing ones stay valid.
5. **Live My Socials:** add live My Socials icons alongside today's pasted links, or keep links copy-only?
6. **Banner:** is the Classic Banner importable as a live Wall image?
7. **Migrations:** each new field or the Phase 3 projection needs your authorisation (TESTING only, rehearsed first).

## 10. Phase 1 delivered (2026-10-19)

Mazen's task "GAMID — MY GAMER DATA — PHASE 1 IMPLEMENTATION" (desktop only). Product `e1a43c22d06526e498cdb67326ce90733d83b2db`, TESTING run `39203875352`; details in `docs/WALL-EDITOR-DESKTOP-REDESIGN.md` (My Gamer Data) and `PROJECT_HANDOFF.md` §94.

- **Delivered:**
  - the names (My Gamer Data / Import from Classic);
  - six accordion groups covering today's options (Profile, Gaming Roles, My Games, Connections, My Duo, My Crews);
  - one entry per option: "All …" is the GamID block, and the data collections are no longer listed a second time;
  - count and "Not on your GamID yet" tags;
  - a **Refresh from Classic** control.
- **Differences from §7:**
  - Groups are always listed: an empty one is tagged rather than hidden, and its choices still add their element, which draws its own empty state.
  - There is no "not public" tag; the canvas already marks private data.
  - Refresh is an explicit control, not automatic on focus.
  - There is no Layers marker.
- **Proposed (italic) options:** none added; they remain Phase 2 / 3.

## 11. Phase 2 status (2026-10-19)

The import foundation follows §6.
- **Built:**
  - the catalog extension;
  - one projection branch per section, built from Classic's gated reads;
  - the format-only `section` binding;
  - generic presentations;
  - automatic library discovery;
  - About Me and Favorite Games.
- **Not applied or deployed:** the two migrations await Mazen's approval.
- **Differences from §6:**
  - The validator checks the section key's **format**, not the catalog: the Wall's CHECK constraints may not read tables, and a retired section then draws nothing instead of invalidating saved Walls.
  - There are two public RPCs (owner and anon) rather than one owner "variant".

Details: `docs/MY-GAMER-DATA-PHASE2.md`.