---
id: DIS-0002
title: GamID full-list navigation and next-chat continuity
status: CONCLUDED
created: 2026-10-09
updated: 2026-10-09
scope: GamID product overview, backlog navigation, cross-chat continuity
summary: Mazen requested that future chats reconstruct the complete GamID list across authoritative state, Product Memory, roadmap and pending acceptance, instead of offering a partial brainstorm shortlist.
related: [DIS-0001, IDEA-0001, ISS-0001, ISS-0002, ISS-0003, ISS-0004, ISS-0005]
save_approval: Mazen 2026-10-09
supersedes: []
sources: [PROJECT_STATE.md, gamid-truth.json, GAMID_ROADMAP.md, PROJECT_HANDOFF.md, product-memory/INDEX.md]
---

## Context

Mazen asked for the full GamID list, rejected an eight-item suggestion list as incomplete, reviewed a consolidated view and explicitly asked to save that list for use in a new chat. This is a navigation snapshot, not a second authoritative backlog or permission to implement anything.

## Discussion points

### Implemented and accepted in TESTING (refer to live GamID Truth for exact current statuses)

- Canonical Cloudflare TESTING and same-origin auth; Account + SOLO identity; Intro/Transition Engine and accepted F2/F5 optimizations.
- Gaming Roles / Education & Work; permanent public @handle URL; per-section privacy controls.
- Discord and Steam connections; public My Games; Game ID Wall editor, media, backgrounds, templates, links and publishing.
- Notifications and authenticated shell; My Duo, My Crew, Play Together, Marvel Rivals Quick Match and Discord Team Voice.

### Implemented, pending formal acceptance (verify current Truth)

- YOUR GAMID Profile Editor, Intro Identity owner upload/processing/preview, Public GamID Profile.
- Steam My Games discovery, League of Legends prototype, canonical game catalog/manual game add.
- Global Usage Center and landing page.

### Product Memory register at discussion time

- IDEA-0001: Profile Editor gaming-dashboard redesign, DEFERRED.
- ISS-0001: unified upload/Add error UX, AUTHORIZED; ISS-0002..ISS-0005: stale 10-vs-15 video text, misleading Wall quota error, obsolete SAVE GAMID text, hidden replacement Intro failure, all AUTHORIZED but not FIXED/VERIFIED at snapshot.
- DIS-0001: existing platform picker and Other text link, CONCLUDED; avoid proposing this as a new feature.
- Always load the live Product Memory INDEX.md for additional records or changed statuses.

### Roadmap / exploration topics, not proof of missing functionality or implementation authorization

- Play Together: live Riot catalog synchronization, no-show policy, reports/blocks; AI-assisted matchmaking exploration.
- Connections and data: PlayStation, Xbox, Riot and additional official game integrations; ranks, history, achievements, games filtering and discovery.
- Future entity types: Team, Organization, Company beyond SOLO.
- Sharing/social preview expansion; safe external link review; GamID Shield focused on session abuse/manipulation.
- Watchable team gaming sessions / streaming concept; deferred Profile Editor dashboard design.
- The above combines roadmap directions and prior user discussions. Verify each against current implementation and source docs; some may be partially implemented or not yet formally registered.

### Outstanding acceptance / continuation at snapshot

- Claude authorized to implement all five ISS-0001 audit phases together in TESTING; records saved, implementation not yet confirmed at snapshot.
- Profile Editor desktop/Android manual acceptance; Intro Android duration-boundary retest.
- Global Usage manual acceptance checks; Product Memory V1 acceptance; later main landing decision after pending acceptance.
- No Production access or main merge without separate approval.

## Conclusion

In any new GamID chat, start with PROJECT_STATE.md, then gamid-truth.json, AGENTS.md, relevant docs, product-memory/INDEX.md and records, and GAMID_ROADMAP.md. Present the complete list in distinct categories: accepted existing, implemented pending acceptance, authorized/open issues, deferred ideas, future directions, and next actions. Verify branch HEAD and code before declaring a gap. Do not duplicate features already present, do not assume this 2026-10-09 snapshot remains current, and do not equate saved ideas with implementation authorization.

## Reasoning

A navigable, source-linked snapshot helps ChatGPT, Claude Code and Work continue the user's planning without relying on chat memory, while leaving current product facts in GamID Truth and issues in their original records.

## History

- 2026-10-09 CONCLUDED — User explicitly approved saving the consolidated GamID list for new-chat continuity.
