---
id: DEC-0011
title: Wall Stages — My Stage and Friends Stage (stage types, sticker moderation, conversion rules)
status: APPROVED
created: 2026-10-22
updated: 2026-10-22
scope: GamID Wall stages (owner editor and the future Friends Stickers system)
summary: A Wall has at most 3 stages, each either a My Stage (the existing personal editing) or a Friends Stage (friends' stickers, owner-approved and owner-removable, official catalog backgrounds only); at least one My Stage always; a Friends Stage with active stickers cannot be deleted or converted until they are gone. Approved design only - not implemented.
related: [DEC-0010, DEC-0008]
save_approval: Mazen 2026-10-22
authorization: NONE
supersedes: []
truth_refs: [game-id-wall, wall-editor-stages-bar, wall-assets-background, wall-universal-delete]
checkpoints: []
sources: [gamid-truth.json, docs/WALL-EDITOR-DESKTOP-REDESIGN.md, docs/WALL-BACKGROUND-INSIDE-ASSETS.md]
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

**F. Sequencing**
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
- **Existing Walls with more than 3 stages** when the maximum is introduced, and how Add stage behaves at the maximum. This changes the current Truth contract `stages-add-appends` once implemented.
- **Existing stages:** whether they become My Stages by default when stage types are introduced.
- **Visitors:** how a Friends Stage appears on the public Wall (including Mobile Public Wall Visitor V2).

## Alternatives considered

- **No stage-type distinction (friends post on any stage):** rejected. The owner's personal stages must keep their existing editing and design control.
- **Allowing 0 My / 3 Friends:** rejected. The Wall must always keep at least one stage that is the owner's own.
- **Deleting or converting a Friends Stage regardless of its stickers:** rejected. It would remove friends' contributions as a side effect instead of by an explicit, counted owner action.

## History

- 2026-10-22 PROPOSED — Stage types (My Stage / Friends Stage), the allocation rules, sticker moderation and conversion / deletion rules defined by Mazen.
- 2026-10-22 APPROVED — Mazen approved the design and its saving as Product Memory. No implementation authorization (`authorization: NONE`); nothing implemented or accepted.
