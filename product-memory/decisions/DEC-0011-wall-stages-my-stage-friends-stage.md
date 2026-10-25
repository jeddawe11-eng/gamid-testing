---
id: DEC-0011
title: Wall Stages — My Stage and Friends Stage (stage types, sticker moderation, conversion rules)
status: ACCEPTED
created: 2026-10-22
updated: 2026-10-25
scope: GamID Wall stages (owner editor and the future Friends Stickers system)
summary: A Wall has at most 3 stages, each either a My Stage (the existing personal editing) or a Friends Stage (friends' stickers, owner-approved and owner-removable, official catalog backgrounds only); at least one My Stage always; a Friends Stage with active stickers cannot be deleted or converted until they are gone. Stage allowance 3 for everyone today (approved direction: Free 3 / Pro 5; Pro not implemented). A Friends Stage is optional (only the owner's explicit choice creates one; new stages are My Stages); an empty Friends Stage stays visible with a display-only message. Implemented on TESTING 2026-10-23 (4c97ed9, with the Add stage fix a084cb1); the implemented Wall Stages V2 scope was ACCEPTED by Mazen on 2026-10-23. Friends Stickers V1 (sending, owner approval and moderation, the official Friends Stage background) was implemented on TESTING 2026-10-24 and given Mazen's FINAL ACCEPTANCE on 2026-10-25 (REV-0026). Sticker expiry, Delete All Stickers, the official background catalog, Premium and Pro remain approved direction only, not implemented.
related: [DEC-0010, DEC-0008, REV-0025, REV-0026]
save_approval: Mazen 2026-10-22
authorization: Mazen 2026-10-22, task "GAMID - WALL STAGES V2" (implementation, testing and TESTING deployment; the Friends Stickers system, Premium and Pro excluded)
acceptance: Mazen 2026-10-23 accepted Wall Stages V2 on TESTING a084cb1 after manual testing on desktop and Android (stage limit, My / Friends Stage conversion, persistence, owner and visitor empty Friends Stage messages); scope in "Acceptance (2026-10-23)"
supersedes: []
truth_refs: [wall-stage-types, game-id-wall, wall-editor-stages-bar, wall-assets-background, wall-universal-delete, friends-stickers]
checkpoints: [4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7, 4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9, a084cb17c7c43aa0a84f1099a3f567d297dc98c7, 6a7b89a9a62a23948f6c121ca11734fb36fe1796, 1aba37844405d5c66e7777d453725b308b74a1f6]
sources: [docs/WALL-STAGES-V2.md, gamid-truth.json, PROJECT_HANDOFF.md, docs/WALL-BACKGROUND-INSIDE-ASSETS.md, docs/FRIENDS-STICKERS-V1.md]
---

## Context

Mazen defined how Wall stages will be divided between the owner's own content and contributions from friends, and approved saving the design (2026-10-22). It records the intended product behaviour only. Nothing here is implemented, and implementation needs his separate authorization. (As saved on 2026-10-22. What has since been implemented and accepted is in "Acceptance (2026-10-23)" and the History.)

**Current state (2026-10-22, for contrast; GamID Truth owns it).**
- A personal Wall has no stage maximum: the schema and the database require only a non-empty set of stages.
- Every stage is an ordinary editable stage.
- Add stage always appends (Truth `wall-editor-stages-bar`, contract `stages-add-appends`).
- Backgrounds come from the owner's uploads, colours and gradients (Truth `wall-assets-background`).
- Crew Walls are separate (Truth `my-crew`, limit `crewWallStages` 2).

## Decision

**A. Stage types and allocation**
- A GamID Wall has **at most 3 stages** under the current agreed design.
- Each stage is designated **My Stage** or **Friends Stage**.
- A Wall always contains **at least one My Stage**, with any number of stages.
- With three stages, the valid splits are 3 My / 0 Friends, 2 My / 1 Friends and 1 My / 2 Friends. **0 My / 3 Friends is prohibited.**
- The owner can change a stage's type within these rules (see E for Friends Stages with stickers).

**B. My Stage**
- Keeps the existing personal Wall editing capabilities.
- No unrelated change to the current editor behaviour.

**C. Friends Stage**
- Reserved for contributions from friends.
- The owner cannot add ordinary editor elements (text, images, videos and the like) to it.
- The owner cannot upload or assign a custom background. The background comes only from the **official GamID background catalog**:
  - the catalog offers Free and Premium backgrounds, subject to entitlement;
  - the owner chooses an eligible one.
- **A friend's sticker appears only after the owner approves it.** The owner approves or rejects each incoming sticker.

**D. Sticker ownership and moderation**
- Once a friend's sticker is placed, the Wall owner has authority to remove it.
- The owner may delete individual stickers.
- A future **Delete All Stickers** action asks for explicit confirmation, consistent with DEC-0008.
- Deletion is **permanent**.

**E. Stage conversion and deletion**
- A Friends Stage with **active stickers** cannot be deleted or converted into a My Stage directly.
- The owner first removes the stickers (individually or with Delete All Stickers), or waits until they expire.
- With no active stickers left, the stage may be deleted or converted, provided the Wall still keeps at least one My Stage.
- Before any destructive action, the interface states how many active stickers the stage has.

**F. Stage allowance and tiers (Mazen, 2026-10-22, with the implementation authorization)**
- **Current limit: 3 stages for everyone.**
- **Approved future direction:** Free 3 stages, Pro 5 stages.
- **Pro is not implemented** and no subscription, billing, upgrade or Pro entitlement is to be built or simulated.
- The allowance is decided in one server-side place, independent of any future subscription provider, so it can later be resolved by entitlement without rebuilding the Stages system.
- Legacy stages without a type are My Stages; no stored Wall is cut, truncated or rewritten to introduce the limit or the types.

**G. A Friends Stage is optional; the empty Friends Stage (Mazen, 2026-10-23)**
- A Friends Stage is **entirely optional**. The maximum is **3 stages in total** (not 3 My Stages plus Friends Stages): 3 My / 0 Friends, 2 My / 1 Friends and 1 My / 2 Friends are all valid, and at least one My Stage always remains.
- **New stages are My Stages.** Only an explicit owner action makes a stage a Friends Stage; nothing creates, reserves or converts one automatically.
- An empty Friends Stage **stays visible to visitors**, with a display-only message inside it:
  - visitors: "FRIENDS STAGE" / "Good friends leave their mark! ✨" / "This stage is waiting for a little love from friends like you." / "STICKERS COMING SOON";
  - the owner (editor and its Preview): "YOUR FRIENDS STAGE" / "Waiting for your squad! 🎮" / "Your friends will leave their mark here. Every sticker will tell a story." / "FRIENDS STICKERS · COMING SOON".
- The message is UI only: never a Wall element, layer, asset or stored data, never interactive, and it disappears once approved stickers are visible.
- Still not implemented: the Friends Stickers system, Premium subscription and the official background catalog. The future direction stays Free 3 / Pro 5, without implementing Pro.

**H. Sequencing**
- The core Wall work is finished first, and the full Friends Stickers system is built afterwards.
- Sticker pricing, exact durations, purchase models and the full Friends Wall implementation are separate work.

## Acceptance (2026-10-23)

Mazen accepted Wall Stages V2 on TESTING `a084cb1` (run `39963845626`) after testing it manually on desktop and Android. He checked:
- the stage limit (3 stages, Add stage showing MAX 3 STAGES at the limit);
- My Stage / Friends Stage conversion;
- persistence (save and reload);
- the owner and visitor empty Friends Stage messages.

**Accepted (implemented scope):**
- A, B: the stage types and their allocation, with at least one My Stage.
- C: what the owner cannot put on a Friends Stage (no own elements or backgrounds; a Friends Stage never shows the Whole-Wall background).
- E: the conversion and deletion rules as they apply today (nothing on a stage is removed to change its type; the delete question states the active-sticker count).
- F: the server-side allowance, 3 for everyone.
- G: an optional Friends Stage and the empty Friends Stage message.

**Not implemented and not accepted (decided direction, still open for separate work):**
- the Friends Stickers system: sending, owner approval, placement, expiry, sticker deletion and Delete All Stickers (C, D), and the active-sticker blocking in E once stickers exist;
- the official GamID background catalog and Premium backgrounds (C);
- the Free 3 / Pro 5 tiers, Pro, and any subscription or billing (F);
- the open questions below.

## Acceptance (2026-10-25): Friends Stickers V1

Mazen gave his FINAL ACCEPTANCE of the whole Friends Stickers V1 system on TESTING on 2026-10-25, with no remaining feedback or requested changes (REV-0026; Truth `friends-stickers` ACCEPTED; product checkpoint 6a7b89a, TESTING site 1aba378). The "Acceptance (2026-10-23)" section above is kept as it stood that day.

**Now implemented and accepted** (details in Truth `friends-stickers` and docs/FRIENDS-STICKERS-V1.md):
- From C: friends' stickers on a Friends Stage, each shown only after the owner approves it.
- The official GamID Friends Stage background - one supplied background, not a catalog.
- From D: the owner removes individual approved stickers (asked once, permanent) and can move them.
- From E: the active-sticker blocking. A Friends Stage with approved stickers can be neither deleted nor converted until they are removed.
- Open question "Friend": settled for V1 as any signed-in player whose own GamID is public.
- Open question "Stickers": settled for V1 as 14 free stickers and 5 counted sends per player per rolling 24 hours.

**Still not implemented and not accepted:**
- sticker expiry and Delete All Stickers (D, E);
- the official background catalog and Premium backgrounds (C);
- the Free 3 / Pro 5 tiers, a Pro sticker allowance, and any subscription or billing (F);
- sticker pricing and purchase models.

## Reasoning

- **Two stage types:** they give friends a dedicated, owner-controlled space without changing how the owner edits their own stages.
- **Catalog-only backgrounds and approval before display:** they keep a Friends Stage safe and consistent.
- **Minimum one My Stage:** the Wall always remains the owner's own identity.
- **Blocking conversion and deletion while stickers are active:** friends' contributions are never removed silently by a structural change. Removal is always an explicit owner action, or expiry.

## Open questions (unresolved; to be decided separately)

- **Stickers:** expiration periods, economics, pricing and purchase models (Free / Premium, how stickers are obtained).
- **Premium backgrounds:** what entitles an owner to them.
- **"Friend":** who counts as one (existing relationships such as My Duo or Crews, or a new one), and how a friend sends a sticker and the owner is told about it.
- ~~Existing Walls with more than 3 stages; existing stages' type~~ - settled by the 2026-10-22 implementation task (F): legacy stages are My Stages, nothing is cut, and Add stage stops at the allowance (the TESTING audit found no Wall above 3 stages). Truth's `stages-add-appends` changes once the implementation is deployed.
- ~~Visitors: how an empty Friends Stage appears~~ - settled by Mazen on 2026-10-23 (G): it stays visible with the visitor message.
- **Official background catalog:** the Free / Premium GamID catalog and its files do not exist yet; until they do, a Friends Stage keeps the plain stage colour.

## Alternatives considered

- **No stage-type distinction (friends post on any stage):** rejected. The owner's personal stages must keep their existing editing and design control.
- **Allowing 0 My / 3 Friends:** rejected. The Wall must always keep at least one stage that is the owner's own.
- **Deleting or converting a Friends Stage regardless of its stickers:** rejected. It would remove friends' contributions as a side effect instead of by an explicit, counted owner action.

## History

- 2026-10-22 PROPOSED — Stage types (My Stage / Friends Stage), the allocation rules, sticker moderation and conversion / deletion rules defined by Mazen.
- 2026-10-22 APPROVED — Mazen approved the design and its saving as Product Memory. No implementation authorization (`authorization: NONE`); nothing implemented or accepted.
- 2026-10-22 AUTHORIZED — Mazen authorized the implementation ("GAMID - WALL STAGES V2", TESTING only) and approved the tier direction (current 3 for everyone; future Free 3 / Pro 5; Pro not implemented). The Friends Stickers system, Premium and Pro stay out of scope. 2026-10-23: with Mazen's explicit approval this record also gained G - the Friends Stage is optional and the empty Friends Stage message (owner / visitor wording); the open visitor question is settled.
- 2026-10-23 IMPLEMENTED — Deployed to TESTING: product 4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7, site 4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9 (run 39821008183); migrations 20261022120000_wall_stage_types and 20261022120100_wall_public_publishing_stage_limit applied, every stored Wall unchanged (PROJECT_HANDOFF.md section 120). Truth wall-stage-types PENDING_ACCEPTANCE. Awaiting Mazen's manual acceptance. Then the Add stage at-allowance fix a084cb17c7c43aa0a84f1099a3f567d297dc98c7 (run 39963845626, section 121).
- 2026-10-23 ACCEPTED — Mazen accepted the implemented Wall Stages V2 scope on TESTING a084cb1 after manual testing on desktop and Android: stage limit, My / Friends Stage conversion, persistence, and the owner and visitor messages. Truth wall-stage-types ACCEPTED. Friends Stickers, sticker moderation, the official catalog, Premium and Pro stay unimplemented (see "Acceptance (2026-10-23)"). 2026-10-25: Friends Stickers V1 (implemented on TESTING 2026-10-24, product 524939c, follow-up 6a7b89a, clip icon 1aba378) received Mazen's FINAL ACCEPTANCE; with his authorization this record gained "Acceptance (2026-10-25)", and the status stays ACCEPTED (REV-0026).
