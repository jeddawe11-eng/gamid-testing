# Wall Stages V2: My Stage / Friends Stage (DEC-0011)

Mazen's task "GAMID — WALL STAGES V2" (2026-10-22), TESTING only. The design is Product Memory **DEC-0011**.

**Status (2026-10-22): implemented and validated locally only.**
- Not committed.
- The two migrations are **not applied**.
- Nothing is deployed to TESTING.
- Not accepted.

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

**Migrations** (not applied):
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
- "N / 3 stages", with Add stage disabled at the allowance and the reason shown;
- a My Stage / Friends Stage switch for the open stage;
- a Friends badge on the stage's tab.

Below 1200px, Move earlier / Move later / Delete show their short icon labels (accessible names unchanged) so the tabs keep their room.

**Phone (Stages sheet):** the same count and switch through the same handlers, and each row says My Stage or Friends Stage. The phone's Stages bar keeps its tabs and actions.

**While a Friends Stage is open:**
- its panel takes the place of every tool panel: the explanation, the catalog (Free / Premium, "not available yet") and Make this a My Stage;
- the canvas shows a Friends Stage note.

## 3a. The empty Friends Stage message (Mazen's UX addition, 2026-10-23; local only, not deployed)

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
