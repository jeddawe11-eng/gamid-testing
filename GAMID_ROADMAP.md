# GamID Product Roadmap

This is the readable product roadmap. `PROJECT_HANDOFF.md` is the authoritative technical continuation document.

Nothing marked **Approved direction**, **Idea only**, or **Requires Mazen approval** is implementation authorization.

## CREATE → WOW → SHARE

GamID is a gaming identity platform:

1. **CREATE** a personal gaming identity.
2. **WOW** with Intro, transition, and presentation.
3. **SHARE** through a permanent link, QR, social bio, or message.

The current entity is **SOLO**. Team, Organization, and Company are future direction.

## What exists

| Product area | Status |
|---|---|
| Intro / Transition Engine | **Implemented and accepted** |
| Account + SOLO Identity | **Implemented and accepted** |
| YOUR GAMID editor | **Implemented, not formally accepted** |
| Gaming Roles + Education & Work | **Implemented and accepted** |
| Intro Identity Integration | **Implemented, not formally accepted** |
| Public GamID Profile — Slice 1/2 (Foundation + Public-Safe Data) | **Implemented, not formally accepted** |
| Public GamID Profile — Slice 2/2 (Public Experience + Intro/Transitions) | **Not started** |

Current implementation checkpoint: `697b6e3773233d4b403becb63a6857893dbe0ea2` — Public GamID Profile Slice 1/2 (Foundation + Public-Safe Data), built on top of the accepted Split Reveal Intro-visibility fix `d7466f99e6f5398c5c0e83c029f1d09715c1321f` and the Slice 3C backend/timer checkpoint `2fbfe3197f0f409a9c4247760740c61ad4618f43`; see `PROJECT_HANDOFF.md` section 7b.

## Ordered roadmap

### 1. Decide whether/when to close Slice 3C acceptance checks

**Deferred verification — Requires Mazen approval**

Deferred: Intro/transition visual review, Replace and Remove regressions, final Samsung automatic Processing → Ready check without refresh, and desktop quality review. Do not resume automatically.

### 2. Public GamID Profile

Split into exactly two implementation slices. Do not treat either as authorization for anything beyond its own stated scope.

**Slice 1/2 — Foundation + Public-Safe Data.** **Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7b). Owner-controlled Publish/Unpublish (existing accounts stay private by default), a public-safe anonymous RPC/data boundary exposing only Avatar, Display Name, Permanent Handle, Bio, Gaming Roles, and Education/Work, and a temporary reversible TESTING route (`/public/?handle=`) that renders that data with no editing controls. Explicitly excludes the Intro → Transition experience, the final share-URL scheme, and QR resolution.

**Slice 2/2 — Public Experience + Intro/Transitions.** **Not started.** Requires Mazen's explicit authorization before beginning. Would build the actual Intro → transition → public Identity viewing experience on top of Slice 1/2's data boundary, using the accepted Transition Engine.

Chosen Games, Stats, Connections, Socials, verification indicators, the final permanent share URL, and QR sharing remain separate, unstarted roadmap items (3–9 below) and are not part of either Public Profile slice.

### 3. Permanent share link

**Approved direction — Requires Mazen approval**

Map the permanent handle to a stable public URL for social bios, sites, and messages. An `@handle` form is illustrative; route/domain syntax is not locked. The link must never expose editor controls.

### 4. QR sharing

**Foundation implemented; public experience approved direction — Requires Mazen approval**

Build on the opaque QR identifier so a persistent QR resolves to the same public identity/share destination where appropriate without exposing internal IDs.

### 5. Social Links

**Approved direction — Requires Mazen approval**

Support user-controlled Snapchat, X/Twitter, Instagram, TikTok, YouTube, Twitch, Discord, and other links. Keep social URL, connected account, and API-verified gaming data distinct.

### 6. Gaming Connections Engine

**Approved direction — Requires Mazen approval**

Connect Discord, Steam, PlayStation, Xbox, Riot, and official game/platform APIs where available. Discord can support identity/discovery/linked accounts and permitted presence, but is not a universal stats/history/ranks/achievements source.

### 7. Verified / Connected / Manual model

**Approved direction — Requires Mazen approval**

- **Verified** — authoritative API confirmation.
- **Connected** — linked account with unavailable/limited verified stats.
- **Manual** — user-entered.

Users decide which discovered accounts, games, links, and data are public.

### 8. Games

**Approved direction — Requires Mazen approval**

Turn the Games placeholder into the user's gaming universe and selected showcase titles. Catalog, discovery, provenance, privacy, and ordering need an approved design.

### 9. Stats, ranks, history, achievements

**Approved direction — Requires Mazen approval**

Use official APIs where available and label connected-only/manual data honestly. Terms, refreshing, caching, rate limits, and retention need explicit design.

### 10. Privacy and display controls

**Approved direction — Requires Mazen approval**

Give owners explicit control over public profile fields, Games, Stats, Connections, Socials, Education/Work, and presence. Private data never becomes public automatically.

### 11. Team, Organization, Company

**Approved direction — Requires Mazen approval**

Expand beyond SOLO without assuming shared fields/relationships. Design ownership, membership, roles, permissions, verification, and public identity before schema changes.

### 12. Free vs paid media/subscriptions

**Approved direction — Requires Mazen approval**

Current FREE D3 remains active. Paid D2 and subscription features are future direction. Define quality, retention, quotas, cost, entitlements, and migration first. Always derive from source/Master, never derivative-to-derivative.

### 13. Production readiness

**Required before Production — Requires Mazen approval**

Plan TESTING/Production isolation, rate limits, abuse prevention, quotas, video/Storage/bandwidth/CDN cost, cold starts, retries/idempotency, observability, cleanup, secrets/RLS, privacy, and deletion/export. Production is not authorized.

### 14. Longer-term expansion

**Idea only — Requires Mazen approval**

Analytics, discovery, community, marketplace, jobs, AI experiences, and PWA/native clients remain ideas. None is approved and none should displace CREATE → WOW → SHARE without a product decision.

## Identity Board direction

| Area | Intended role | Status |
|---|---|---|
| Games | Gaming library/universe and selected displayed titles | Placeholder / approved direction |
| Stats | Verified ranks/stats/history/achievements where APIs permit | Placeholder / approved direction |
| Connections | Gaming and platform account connections | Placeholder / approved direction |
| Socials | User-controlled public social links/accounts | Placeholder / approved direction |

Do not implement a placeholder merely because it is visible.

## Guardrails and next decision

- Public profile and owner/editor UI are separate.
- Permanent URL and QR should share a public destination architecture where appropriate.
- Users control public visibility.
- Social links, connected accounts, and verified data are different concepts.
- Official APIs provide verified gaming facts where available.
- Avoid blocking future entity types without inventing them early.
- Every phase needs written scope and Mazen's approval.

Do not automatically continue deferred Slice 3C testing or start “Slice 3D.” Read `PROJECT_HANDOFF.md`, inspect the repository read-only, and ask Mazen which roadmap outcome has priority and what exact scope is authorized.
