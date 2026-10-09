---
id: DEC-0002
title: One social link engine for the Wall and My Socials (Discord personal profiles)
status: IMPLEMENTED
created: 2026-10-09
updated: 2026-10-09
scope: Wall link engine, My Socials (Classic Profile) and the public profile icons
summary: The Wall's link engine is the single source of platform and URL rules; My Socials reuses it, and Discord personal profiles become a Wall Link.
related: [DEC-0001, DIS-0003, DIS-0001]
save_approval: Mazen 2026-10-09
authorization: Mazen 2026-10-09, explicit task "GamID — Unified Social Link Engine (Wall + Classic Profile)" (TESTING only); separate explicit approval to convert @black's one saved Discord My Socials row losslessly
supersedes: []
truth_refs: [my-socials, game-id-wall]
checkpoints: [67042938426f7c234c175483c6882c709b09046d]
sources: [supabase/migrations/20261009150000_wall_discord_profile.sql, supabase/migrations/20261009151000_my_socials_link_engine.sql, docs/PROFILE-EDITOR-UX.md]
---

## Context

My Socials (DEC-0001) shipped with its own platform and URL pattern catalog beside the Wall's link engine: two rule sets that could drift. Separately, the Wall's Discord adapter knew server invites only, so Mazen's official personal profile address (https://discord.com/users/374102653111762948) was refused in the Wall.

## Decision

- The Wall link engine (dist/wall-kit/embed adapters, mirrored on the server by private.wall_embed_specs) is the **only** source of platform and URL rules.
- The Wall gains the Discord kind `profile` (discord.com/users/<numeric id>), offered as a **Link only**. No Player and no new card type are added; invites are unchanged. An engine kind may now narrow its presentations, and the editor's Show as is derived from the engine.
- My Socials reuses the engine:
  - detection, id rules and every rebuilt address come from the adapters;
  - it stores `{ platform, kind, id }` like a Wall link;
  - the server validates ids against the Wall's own server rules;
  - it only narrows which platforms and **account** kinds it offers (profile, channel, page, Discord profile or invite).
- Platforms the Wall does not support (Threads, Reddit, LinkedIn) leave My Socials.
- Saved content is never copied between the Wall and My Socials.

## Reasoning

One rule set cannot drift. The Wall already rebuilds every address from validated parts, and My Socials inherits that safety. Recognizing the platform from the link itself is what the Wall already does well.

## Alternatives considered

- Keep two catalogs with a parity test — rejected: still two sources of truth.
- Add Threads, Reddit and LinkedIn to the Wall so My Socials keeps them — not done: that changes the Wall's supported platforms, a separate product decision.
- Offer the Discord profile as a Card — rejected: Discord has no public profile data GamID can show; a Card would be invented.

## History

- 2026-10-09 APPROVED — Mazen specified the single shared engine and the Discord profile behaviour.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the implementation on TESTING. He separately approved converting @black's one saved My Socials row (the same Discord profile) to the new storage format, preserving the exact URL, ownership and public behaviour.
- 2026-10-09 IMPLEMENTED — Implemented at 6704293 and deployed to TESTING (run 37892333328). Migrations 20261009150000 and 20261009151000 applied. @black's row was verified identical before and after (same address, order, timestamp and GamID record). Acceptance pending.
