---
id: IDEA-0003
title: GamID Discord LFG Bot as a Play Together growth channel
status: DISCUSSION
created: 2026-10-21
updated: 2026-10-21
scope: Play Together, Discord community bot, user acquisition, LFG, privacy
summary: Full discussion and interactive UX simulation of a Discord /lfg bot that works for server members without GamID accounts and can optionally link into existing Play Together.
related: [DEC-0004]
save_approval: Mazen 2026-10-21
authorization: MEMORY_ONLY; NO_IMPLEMENTATION
supersedes: []
truth_refs: [play-together, discord-team-voice, connection-discord]
sources: [gamid-truth.json, product-memory/INDEX.md]
---

## Context

Source: Mazen's discussion of 2026-10-21 (a conversation, not a repository file). He explicitly requested saving the complete idea, the answer and the simulation.

### Why this exists: cold start and distribution

Mazen identified a two-sided liquidity problem: if GamID launches Play Together with roughly ten games and a small user population per game, players will not find teammates, regardless of product quality. Manually adding games also takes time. His proposal is to reach communities that already exist: Discord server owners install a GamID bot, and their members organize gaming together. The bot must be valuable to server owners and members independently of GamID registrations, not an unsolicited advertising bot. The community's existing players supply initial liquidity; optional GamID account linking drives discovery and growth.

Separate **game catalog coverage** (research broader supported catalog/import source; do not assume games exist) from **active teammate liquidity** (start inside individual Discord servers). Do not claim server membership totals are unique people or registrations. Example: 100 servers x 500 memberships = 50,000 server memberships, not 50,000 unique users; 10% conversion = 5,000 membership-equivalent signups before deduplication, strictly illustrative.

### Product strategy context

This idea arose during discussions of GamID retention and monetization. Discord Nitro demonstrates demand for identity/personalization and community utility; GamID should not block public profile views or core friend participation to force subscriptions. Play Together supplies a practical return reason; Friends Wall/social interactions supply a relationship-driven return reason. The Discord bot targets cold-start acquisition and repeat team formation. Potential Free/Plus tiers, cosmetics and usage limits were exploratory, **not approved prices or entitlement changes**.

## Proposal

### Full /lfg experience and interactive simulation

User invokes `/lfg` in an allowed channel. A guided Discord interaction collects:
- **Game:** simulated options Valorant, Marvel Rivals, Fortnite, Minecraft. These are *mock options*, not an approved supported-game catalog.
- **Team size:** 2, 3, 4, 5 or 6 players; any real game-specific constraints require validation.
- **Mode:** Casual, Ranked or Custom.
- **Region:** Middle East, Europe, Asia, North America.
- Publish action **“نشر طلب الفريق” / Publish LFG** creates one request in the configured channel. The requester is automatically counted as player 1.

The published card is modeled as:
```text
🎮 GamID Bot — Looking for Group                [OPEN]
[Game artwork]  Valorant
Casual · Middle East
Players 1 / 5   [■□□□□]
[Join / Request to Join]   [Cancel / Leave, as appropriate]
```
Artwork and counts are illustrative. Every new member joins through a real distinct Discord identity; the chat mock's “محاكاة انضمام لاعب” button increments a simulated count only, and is **not** a working Discord integration. The mock uses a five-player default, starts at 1/5, changes to FULL at 5/5, then shows **“اكتمل الفريق!”** and a **“تأكيد جاهزية الفريق”** action. Once confirmed it displays a ready state and directs members to the configured voice room or meeting instructions. The demonstration also allows changing game, team size, mode and region; editing game/size resets the mock's published state and player count. No actual message, game session, data save or bot installation occurs.

#### Join modes (design alternatives, not approved behavior)

1. **Quick Join:** click Join, claim an available seat immediately; convenient for casual sessions and smaller servers.
2. **Host Approval:** click Request to Join; host receives a request and Approve/Reject controls. Recommended default for sessions bridged to existing GamID Play Together, whose accepted contracts already cover join-request, approve and reject notifications. Never assume Quick Join is supported by the existing Play Together backend.

When a team reaches capacity, mark FULL and stop new joins; notify host and offer readiness confirmation. On host confirmation, use an existing voice room or optionally provision a temporary voice channel **only if bot permissions and admin settings permit**. Before starting, a member leaving reopens the seat and restores OPEN. Host cancellation or expiration closes the request and disables stale buttons. Optional voice behavior must be validated against existing accepted Discord Team Voice rather than assuming compatibility.

#### Edge cases, safety and abuse

- Atomic last-seat allocation under simultaneous clicks; no overbooking.
- One active seat per Discord member per request; avoid duplicate clicks.
- Handle host leaving server (transfer leadership by explicit rule or cancel); unresolved choice.
- Member leaving after FULL before start reopens the request.
- Configurable request TTL; auto-expire abandoned LFG cards.
- Rate limits for requests and notifications, active-request caps, server moderation controls.
- Respect Discord bans, channel permissions, role visibility, voice access and member privacy; bot must not bypass them.
- Define behavior on game changes, capacity changes, host absence, disconnected GamID account and API failures before implementation.
- Never automatically DM promotional content or treat detected game activity as permission for marketing.

### Server owner installation and configuration mock

The interactive admin setup prototype includes:
- LFG channel select: `#looking-for-group` (default), `#gaming`, `#general`.
- Join policy radio: **Host Approval** (default recommendation) or **Instant Join**.
- Toggle **temporary voice rooms** (mock default ON; implementation permission-gated).
- Toggle **game alert subscriptions** (mock default OFF; opted-in players only).
- Read-only summary of selections. The controls in the chat are **local simulations only**, do not save settings and do not connect to Discord.

Server owner's value proposition: organized teams, less chaotic chat, better member activity; GamID promotion is secondary. Avoid forcing all server members to register before using the core LFG flow.

### Optional GamID integration

A Discord member can create/join LFG **without a GamID account**. Optional verified account linking may enrich the card with a public GamID identity, allowed games and owner-consented public links, and lead users into the existing Play Together experience. Do not expose private profile data, private game information, or a Discord Profile Card without its existing independent consent. Keep one authoritative Play Together session model where technically feasible; **do not silently create a parallel team/session database**. Existing GamID Truth shows accepted Play Together join-request/approve/reject notifications and accepted Discord Team Voice; mapping Discord roles, permissions, seats, timing and voice semantics into that contract requires a compatibility study.

## Reasoning

### Growth loop, success metrics and staged exploration

1. Discord server owner installs the useful bot.
2. Members create LFGs and find teammates **within their existing community**.
3. Some members voluntarily link GamID.
4. Linked players discover identities, profiles and Play Together; sharing can lead to additional communities.
5. Measure whether the bot grows GamID, not just whether the bot is used.

Proposed metrics: requests created, share of teams reaching full/starting, repeat use by the same Discord players, opt-in GamID account link and conversion, number of active servers, duplicate-account adjusted acquisition. A bot with high usage but low GamID linking is useful but has **not** yet proven itself as a GamID acquisition channel.

Suggested **research/MVP scope only**: `/lfg`, publishable team card, request-to-join, host approve/reject, leave/cancel, TTL/expiry, full-team notice; opt-in alerts and temporary voice can follow separate permission review. No Presence monitoring or unsolicited DMs in the initial proposal.

### Discord Presence: possibility and privacy boundary

Mazen proposed detecting which games server members play and notifying them based on activity. Discord Presence events can expose visible game activity in guilds where a bot is present, subject to privileged **Guild Presences Intent**, Discord verification/approval thresholds and each user's privacy settings. Presence does **not** provide an installed-game library or hidden activity. Its existence does not authorize unsolicited direct messages, surveillance or marketing. Prefer **explicit opt-in game subscriptions** and user-created LFG requests as the initial direction. Defer any Presence monitoring pending policy, permission, security and value review. References: https://discord.com/developers/docs/events/gateway-events#presence-update and https://discord.com/developers/docs/topics/gateway#privileged-intents.

### Status and approval boundaries

Mazen explicitly approved **saving this complete discussion and the simulation** to Product Memory. This is **not approval to implement, deploy, add a bot, access Production, change Discord permissions, introduce pricing, or modify existing accepted Play Together contracts**. Open questions include supported game catalog, exact join policy, team lifecycle and TTL, voice permissions, notifications, opt-in/Presence policy, GamID linking and economics. Preserve all alternatives for future decision. No change to gamid-truth.json is warranted for a discussion-only memory save.

## Open questions

The unresolved decisions raised above, collected here; all alternatives stay open:

- Supported game catalog and its import source (the /lfg game list above is mock only).
- Exact join policy: Quick Join or Host Approval, and the server-level default.
- Team lifecycle and request TTL.
- Host leaving the server: transfer leadership by an explicit rule, or cancel.
- Behavior on game changes, capacity changes, host absence, a disconnected GamID account and API failures.
- Voice permissions: an existing voice room or permission-gated temporary channels; compatibility with the accepted Discord Team Voice.
- Notifications: what is sent, to whom, and the rate limits.
- Opt-in alert subscriptions and whether any Presence use is ever acceptable (policy, permission, security and value review).
- GamID account linking, and how Discord roles, permissions, seats, timing and voice map onto the single existing Play Together session model.
- Economics: any Free/Plus tiers, cosmetics or limits (exploratory only).

## History

- 2026-10-21 DISCUSSION — Saved at Mazen's explicit request (the complete idea, answer and simulation); memory only, no implementation. Same day, restructured into the template sections with Mazen's approval to fix validation; content unchanged.
