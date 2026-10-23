# Wall Stages V2: My Stage / Friends Stage (DEC-0011)

Mazen's task "GAMID — WALL STAGES V2" (2026-10-22), TESTING only. The design is Product Memory **DEC-0011**.

**Status (2026-10-23): ACCEPTED by Mazen on TESTING `a084cb1` (§7).**
- Product `4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7`; site `4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9` (run `39821008183`).
- Both migrations are **applied** to TESTING, and every stored Wall is byte-identical before and after (§6).
- The Add stage at-allowance fix `a084cb17c7c43aa0a84f1099a3f567d297dc98c7` (run `39963845626`) is part of the accepted state.
- Truth: `wall-stage-types`, ACCEPTED (checkpoint `a084cb1`).
- Not implemented and not accepted: the Friends Stickers system, Premium, Pro and the official background catalog.

## 1. Behaviour

**Stage types.** Every stage is a **My Stage** or a **Friends Stage**.
- A stage without `type` is a My Stage, so every existing Wall is unchanged and valid with no rewrite.
- A Friends Stage is `type: "friends"`.
- A Wall always keeps at least one My Stage. With three stages, 3/0, 2/1 and 1/2 (My/Friends) are valid; 0/3 is refused.

**Allowance.**
- Today **3 stages for everyone**.
- The approved direction is Free 3 / Pro 5. Pro is not implemented, and no plan, entitlement, billing or upgrade exists.
- One server function decides the allowance: `private.wall_stage_allowance(entity)`, read by the editor through `public.get_my_wall_stage_allowance()`.
- The document core has no maximum.
- Add stage still appends at the end (a My Stage) and stops at the allowance.

**Friends Stage.**
- No ordinary elements and no background of the owner's own. It never shows the owner's Whole-Wall background.
- Its background will come only from the official GamID catalog. **That catalog and its files do not exist yet**, so a Friends Stage keeps the plain stage colour.
- `wall-kit/background-catalog.js` holds the Free / Premium structure, with no entries and Premium never eligible.
- The Friends Stickers system (submit, approve / reject, remove, Delete All Stickers, expiry) is **not built**. `activeStickerCount()` is the single place it will report stickers; it is always 0 today.

**Conversion and deletion.**
- Nothing on a stage is ever removed to change its type.
- **To Friends:** refused for the last My Stage, and refused while the stage has elements or its own background. The editor states what is there and how to clear it.
- **Friends to My:** free while there are no active stickers (always, today).
- **Deletion:** the last stage and the last My Stage cannot be deleted. Deleting a Friends Stage asks first and states its active sticker count.
- **Templates:** a template never lands on a Friends Stage, and a whole-Wall replacement is refused while any Friends Stage has active stickers.

## 2. Where each rule is enforced

| Rule | Browser | Database (authoritative) |
|---|---|---|
| Stage types, Friends Stage contents, at least one My Stage | `dist/wall/stage-types.js` `stageTypeErrors`, appended at the end of `validateDocument` (so every op refuses a breaking change) | `private.wall_stage_type_errors`, appended at the end of `private.wall_document_errors`: the save path and the CHECK constraints of `wall_drafts` and `wall_publications` |
| Stage allowance | `ops.addStage(doc, { limit })`; the editor passes the server's allowance | `save_my_wall_draft_impl` and `publish_my_wall_impl` refuse more stages than the allowance with `WALL_STAGE_LIMIT` (detail = the allowance), unless the Wall does not grow. Nothing is ever cut. |
| Conversion / deletion | `ops.setStageType`, `ops.deleteStage`, `templates/apply.js` | Covered by the document rules: a Friends Stage can never hold elements or a background, and a Wall never lacks a My Stage |

**Migrations** (applied to TESTING 2026-10-23, §6):
- `20261022120000_wall_stage_types.sql`: the type rules, the allowance function, the save limit and the owner's allowance RPC.
- `20261022120100_wall_public_publishing_stage_limit.sql`: the publish limit.

Every changed function is the live TESTING definition plus the new lines only. The changes are additive: no table, row or stored document changes.

**Existing data (TESTING audit, read-only, 2026-10-22):**
- 5 drafts: 3 with 1 stage and 2 with 3 stages.
- 2 snapshots: both 3 stages.
- None above 3 and none typed.
- No data migration is needed.

## 3. Editor

**Desktop and tablet (Stages bar):**
- "N / 3 stages". At the allowance Add stage turns muted grey and reads "MAX N STAGES" (N from the allowance). It stays focusable and clickable (`aria-disabled`, not `disabled`). A click, Enter or Space only shows "You've reached your N-stage limit.": no stage is added, the Wall is not changed or marked unsaved. Below the allowance it is the purple "+ Add stage" again. The phone Stages sheet's Add mirrors it. (Fix `a084cb1`, 2026-10-23: a disabled button looked available on desktop yet did nothing.);
- a My Stage / Friends Stage switch for the open stage;
- a Friends badge on the stage's tab.

Below 1200px, Move earlier / Move later / Delete show their short icon labels (accessible names unchanged) so the tabs keep their room.

**Phone (Stages sheet):** the same count and switch through the same handlers, and each row says My Stage or Friends Stage. The phone's Stages bar keeps its tabs and actions.

**While a Friends Stage is open:**
- its panel takes the place of every tool panel: the explanation, the catalog (Free / Premium, "not available yet") and Make this a My Stage;
- the canvas shows a Friends Stage note.

## 3a. The empty Friends Stage message (Mazen's UX addition, 2026-10-23; accepted 2026-10-23)

**A Friends Stage is optional.**
- A Wall's 3 stages are any mix with at least one My Stage. New stages are My Stages.
- Only the owner's explicit choice makes a stage a Friends Stage; nothing creates, reserves or converts one.

**The message.**
- A Friends Stage the owner created that shows no approved sticker carries a display-only message, centred inside the stage.
- Built by `wall-kit/friends-stage.js` and painted by `paintStage`, styled in `wall-kit.css`.
- It is never a Wall element, layer, asset or stored data, never takes a tap, and offers no sticker action.
- It leaves on its own once the future system reports visible approved stickers (`ctx.stickerCount`; always 0 today).

| | Eyebrow | Title | Line | Badge |
|---|---|---|---|---|
| **Visitor** (public Wall; the default) | FRIENDS STAGE | Good friends leave their mark! ✨ | "This stage is waiting for a little love from friends like you." | STICKERS COMING SOON |
| **Owner** (the owner's editor canvas and Preview) | YOUR FRIENDS STAGE | Waiting for your squad! 🎮 | "Your friends will leave their mark here. Every sticker will tell a story." | FRIENDS STICKERS · COMING SOON |

**Owner versus visitor.**
- Only the editor paints with `audience: "owner"`. It opens only for the signed-in owner, whose Wall the server resolves.
- Every other painter (the public Wall, the Crew Wall) gets visitor wording. No URL or client flag decides it.

**Display.**
- Sized from the stage itself (container units), from a 120px editor stage to the 900px column.
- Below 240px a compact form keeps the eyebrow, title and badge. The note's accessible label always carries the full message.
- The glow pulse stops with reduced motion. No external asset.
- The editor's earlier canvas note was replaced by this message: one message, never two.

**Validation:**
- unit `tests/wall-friends-empty-state.test.js`, 7 tests (requested items 1–6, 9 and 10);
- owner editor E2E 36/36 at 1440×900, 768×1024, 390×844 and 844×390: switching, conversion, resize, Preview, reload, containment, no tap;
- visitor E2E 70/70 at 390×844, 320×568, 844×390, 568×320 and 1440×900, covering 3/0, 2/1 and 1/2 and the empty My Stage.

## 4. Visitors

- A Friends Stage is painted in its place in the owner's order, marked `data-stage-type="friends"`, with no element, no media and no owner background.
- The phone navigator counts it like any stage.
- My Stages render exactly as before.
- A tampered snapshot (a Friends Stage with an element or background, which the database refuses to store) is never painted: the visitor sees the plain "can't be shown" message.
- Until stickers exist, visitors see an empty Friends Stage with the visitor message (§3a). It has no sticker control, and nothing pretends stickers are available.

## 5. Validation (local; Chrome emulation and rolled-back database transactions on TESTING; no real device)

**Unit tests:**
- `tests/wall-stage-types.test.js`: 13 tests;
- pinned tests updated deliberately: `game-id-wall-w2`, `wall-post-qa-editor`, `wall-editor-mobile-v2`, `wall-editor-stages-bar`, `wall-w3-ops`;
- the full suite passes.

**Database (rehearsed, rolled back):**
- `tests/integration/wall-w2-db.sql`: corpus parity, every new stage step, and direct-API refusal of a 4th stage, 0 My / 3 Friends and Friends elements or background. It also covers a Wall above the allowance that saves but never grows.
- 5 remaining failures are identical on the unchanged baseline (storage counts and custom-font fixtures).
- `wall-publishing-db.sql`: 44/44, including that a draft above the allowance is never published and that Friends types survive publishing.
- `wall-gamer-data-db.sql`: 25/25. `crew-wall-db.sql`: 39/39.

**Browser (lab editor; public visitor with mocked reads):**

| Suite | Result |
|---|---|
| Stages E2E (desktop, tablet, phone portrait and landscape) | 42/42 |
| Friends Stage × Background inside Assets | 12/12 |
| Background inside Assets E2E | 73/73 |
| Phone workflow at 390×844 and 844×390 | 81/81 each |
| Navigation order | 40/40 |
| Public visitor with a Friends Stage | 23/23 |

**Panel pixel comparison:** every panel at every size can be captured byte-identical to the baseline. The occasional mismatches are capture noise: a maximum channel difference of 2, also seen between two captures of the same build.

## 6. TESTING delivery (2026-10-23)

**Commits and deployment.**
- Branch `feature/mobile-public-wall-visitor-v2`, not merged.
- Product commit `4be5bfc`; Product Memory `4c97ed9`.
- Site deployed from `4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9`: [run 39821008183](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/39821008183), successful, at <https://gamid-testing-static.gamid.workers.dev/wall-editor/> and `/@handle`.

**Migrations.**
- `20261022120000_wall_stage_types` and `20261022120100_wall_public_publishing_stage_limit`, applied together in one transaction, then recorded in the migration history (`migration repair`).
- Before applying: the three live functions they replace were byte-identical to the definitions they were built from, and the files are pure ASCII.

**Database after the migration.**
- The allowance is 3. `get_my_wall_stage_allowance` is callable by signed-in owners only, never by anon; the rules are not client-executable.
- Live probes refuse a Friends Stage element and a Wall with no My Stage.
- Every stored Wall still validates.
- **The 5 drafts and 2 publications are byte-identical before and after** (document hashes and revisions).

**Served files.**
- The stamp reads `4c97ed9`.
- The changed editor, wall-kit, wall and public files and `/wall-editor/` are byte-identical to the commit.

**Post-deployment checks:**

| Check | Result |
|---|---|
| `wall-publishing-db.sql` on the migrated database (rolled back) | 44/44 |
| `wall-w2-db.sql` | Every stage step and corpus parity pass; the 5 failures that also occur on the baseline are storage counts and custom-font fixtures |
| Live editor page (not signed in): the gate shows, the new markup and modules are served, no page or file errors | 1440×900 and 390×844 pass |
| Visitor empty-state E2E on the live TESTING files (fixture backend) | 70/70 |
| Mobile visitor suite on the live files | 173/173 |
| Pre-release: build | 2,174 tests, 0 failures |
| Pre-release: lab stages / backgrounds / owner empty state | 42/42, 12/12, 36/36 |
| Pre-release: Background inside Assets | 73/73 |

**Not tested:** no signed-in owner session on TESTING (the agent does not sign in as personas), no physical device and no iOS Safari.

## 7. Acceptance (2026-10-23)

Mazen accepted Wall Stages V2 on TESTING `a084cb1` (run `39963845626`) after testing it manually on desktop and Android. He checked:
- the stage limit, including Add stage showing MAX 3 STAGES at the limit;
- My Stage / Friends Stage conversion;
- persistence (save and reload);
- the owner and visitor empty Friends Stage messages.

Truth `wall-stage-types` and Product Memory DEC-0011 (its implemented scope) are ACCEPTED.

The Friends Stickers system, sticker moderation, the official background catalog, Premium, Pro and the Free 3 / Pro 5 tiers stay unimplemented and unaccepted. Mobile Public Wall Visitor V2 is a separate capability and is not part of this acceptance.
