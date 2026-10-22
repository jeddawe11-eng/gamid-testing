---
id: DEC-0011
title: Wall Stages — My Stage and Friends Stage (stage types, sticker moderation, conversion rules)
status: IMPLEMENTED
created: 2026-10-22
updated: 2026-10-23
scope: GamID Wall stages (owner editor and the future Friends Stickers system)
summary: A Wall has at most 3 stages, each either a My Stage (the existing personal editing) or a Friends Stage (friends' stickers, owner-approved and owner-removable, official catalog backgrounds only); at least one My Stage always; a Friends Stage with active stickers cannot be deleted or converted until they are gone. Stage allowance 3 for everyone today (approved direction: Free 3 / Pro 5; Pro not implemented). A Friends Stage is optional (only the owner's explicit choice creates one; new stages are My Stages); an empty Friends Stage stays visible with a display-only message. Implemented on TESTING 2026-10-23 (4c97ed9); not yet accepted.
related: [DEC-0010, DEC-0008]
save_approval: Mazen 2026-10-22
authorization: Mazen 2026-10-22, task "GAMID - WALL STAGES V2" (implementation, testing and TESTING deployment; the Friends Stickers system, Premium and Pro excluded)
supersedes: []
truth_refs: [wall-stage-types, game-id-wall, wall-editor-stages-bar, wall-assets-background, wall-universal-delete]
checkpoints: [4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7, 4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9]
sources: [docs/WALL-STAGES-V2.md, gamid-truth.json, PROJECT_HANDOFF.md, docs/WALL-BACKGROUND-INSIDE-ASSETS.md]
---

## Context

Mazen defined how Wall stages will be divided between the owner's own content and contributions from friends, and approved saving the design (2026-10-22). It records the intended product behaviour only. Nothing here is implemented, and implementation needs his separate authorization.

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
- 2026-10-23 IMPLEMENTED — Deployed to TESTING: product 4be5bfc5b5ae45d59ca4e3871d0dcaeac7e254d7, site 4c97ed9c4ba7bc5a4d0481cac6ed58b985f516b9 (run 39821008183); migrations 20261022120000_wall_stage_types and 20261022120100_wall_public_publishing_stage_limit applied, every stored Wall unchanged (PROJECT_HANDOFF.md section 120). Truth wall-stage-types PENDING_ACCEPTANCE. Awaiting Mazen's manual acceptance.
