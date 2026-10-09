---
id: DEC-0004
title: Discord Profile Card in My Socials from the existing Discord connection
status: ACCEPTED
created: 2026-10-09
updated: 2026-10-10
scope: Profile Editor Connections (Discord), Classic Profile My Socials, Gaming Connections
summary: Visitors who click the Discord icon in My Socials may see a small card (display name, @username, avatar, Open on Discord) taken from the owner's existing Discord connection, only with a separate opt-in and a server-verified match between the My Socials link and the connected account.
related: [DEC-0002]
save_approval: Mazen 2026-10-09
authorization: Mazen 2026-10-09, explicit task "GamID — Discord Profile Card in My Socials" (TESTING only)
acceptance: Mazen manually tested and explicitly accepted the Discord Profile Card on 2026-10-10 (stated in the task "Classic Profile Desktop Redesign — Phase 0"); implementation checkpoint 5757c5f, TESTING run 37898776747; record PROJECT_HANDOFF.md §27
supersedes: []
truth_refs: [discord-profile-card, connection-discord, my-socials]
checkpoints: [5757c5fcd1be61c5058718d971aef200bb751341]
sources: [supabase/migrations/20261009190000_discord_profile_card.sql, PROJECT_HANDOFF.md]
---

## Context

A Discord link in My Socials leads to Discord, which needs a Discord login to view a profile. The existing Discord connection already holds the account id, username, display name and avatar address, read once with the `identify` scope and never refreshed by a stored token. A read-only audit (2026-10-09) found the connection could be reused, but showing the avatar and id to visitors needed new consent. It also found nothing tied the pasted My Socials link to the connected account.

## Decision

- Reuse the existing connection: no new OAuth, scope, token or Discord call when someone visits, and Team Voice is unchanged.
- New, separate opt-in `gaming_connections.show_profile_card` (default false for every row) with `profile_card_consented_at`, recorded while it is on. Both live on the connection row, so Disconnect removes them, and a new connection starts OFF. "Show on my GamID" keeps its meaning and is also required.
- The server returns a card only when the GamID is PUBLIC, the connection exists, Show on my GamID and the card consent are on, and the My Socials Discord profile id equals the connected account id. Otherwise the ordinary link stays.
- The Classic Profile opens the card on click (a modal dialog with Open on Discord). The Wall is out of scope.

## Reasoning

- **A separate opt-in** respects that the owner agreed earlier only to show a name. Discord's Developer Terms 5(b)(iii) allow sharing API Data when the user expressly directs it, with proof on request; the consent time serves as that proof.
- **The server-side id match** prevents a card from vouching for an account the owner does not hold.
- **Reading the card live from the row**, with no copy, means withdrawal or Disconnect takes effect at once.

## Alternatives considered

- Reuse "Show on my GamID" as consent — rejected: that consent never covered the avatar or the account id.
- Extend `get_public_identity` — rejected: it is a large shared function, so the risk is higher. A dedicated reader is smaller and isolated.
- Show the card without a matching My Socials link — rejected for V1: the card hangs off the My Socials icon, and the match is the identity check the task requires.
- Fetch fresh data from Discord when someone visits — rejected: it would need a stored token or bot access. The stored snapshot refreshes when the owner reconnects.

## History

- 2026-10-09 APPROVED — Mazen approved the feature after the read-only Discord OAuth audit.
- 2026-10-09 AUTHORIZED — Mazen explicitly authorized the implementation on TESTING.
- 2026-10-09 IMPLEMENTED — Implemented at 5757c5f and deployed to TESTING (run 37898776747). Migration 20261009190000 was rehearsed (14/14) and applied, and the existing connection rows (@black, @zshot) were verified unchanged and OFF. Acceptance pending. Open requirement: GamID has no privacy policy yet (Discord Developer Terms 5(a)).
- 2026-10-10 ACCEPTED — Mazen manually tested and explicitly accepted the card on TESTING (checkpoint 5757c5f unchanged). The privacy policy requirement above remains open. The separate Discord section is to leave the desktop Classic Profile under DEC-0005; the card itself is unchanged.
