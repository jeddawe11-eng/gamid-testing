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
| Public GamID Profile — Slice 2/2 (Public Experience + Intro/Transitions) | **Implemented, not formally accepted** |
| Permanent Public GamID URL + QR + Sharing | **Implemented, not formally accepted** |

Current implementation checkpoint: see `PROJECT_HANDOFF.md` section 16 for the exact commit — a verified public-Intro reliability fix (retry/ack handshake + deterministic asset versioning), built on top of Permanent Public GamID URL + QR + Sharing, Public GamID Profile Slice 2/2, Slice 1/2, the accepted Split Reveal Intro-visibility fix, and the Slice 3C backend/timer checkpoint; see `PROJECT_HANDOFF.md` section 7g.

## Ordered roadmap

### 1. Decide whether/when to close Slice 3C acceptance checks

**Deferred verification — Requires Mazen approval**

Deferred: Intro/transition visual review, Replace and Remove regressions, final Samsung automatic Processing → Ready check without refresh, and desktop quality review. Do not resume automatically.

### 2. Public GamID Profile

Split into exactly two implementation slices. Do not treat either as authorization for anything beyond its own stated scope.

**Slice 1/2 — Foundation + Public-Safe Data.** **Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7b). Owner-controlled Publish/Unpublish (existing accounts stay private by default), a public-safe anonymous RPC/data boundary exposing only Avatar, Display Name, Permanent Handle, Bio, Gaming Roles, and Education/Work, and a temporary reversible TESTING route (`/public/?handle=`) that renders that data with no editing controls. Explicitly excludes the Intro → Transition experience, the final share-URL scheme, and QR resolution.

**Slice 2/2 — Public Experience + Intro/Transitions.** **Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7d). Builds the actual Intro → Transition → public Profile viewing experience on top of Slice 1/2's data boundary, reusing the accepted Transition Engine and the existing Intro Identity implementation unmodified (via an iframe + postMessage, not a second Intro system). Includes an unobtrusive Replay Intro control and a clean no-Intro fallback. Both Public GamID Profile slices are now implemented; the roadmap item has no remaining unstarted slice.

Chosen Games, Stats, Connections, Socials, and verification indicators remain separate, unstarted roadmap items and are not part of either Public Profile slice. The permanent share URL and QR sharing (items 3–4 below) are now implemented as their own slice — see below.

### 3. Permanent share link

**Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7f). The permanent handle now maps to a stable public URL, `https://jeddawe11-eng.github.io/gamid-testing/@<handle>`, via a `404.html`-based redirect into the existing `/public/` route (GitHub Pages has no server-side rewrites; this is the standard technique for clean URLs on a static project site with no custom domain). The link never exposes editor controls or internal IDs. The temporary `/public/?handle=` route from Slice 1/2 still works unchanged. A real-device report that this link behaved inconsistently in Opera was diagnosed and mitigated — see item below and `PROJECT_HANDOFF.md` section 7g.

### 4. QR sharing

**Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7f). The opaque QR identifier from Slice 2 (`qr_references.public_token`) now resolves anonymously to the same public identity/share destination as the permanent handle, through a new RPC that delegates to the existing gated `get_public_identity_impl` rather than duplicating its rules — publishing/unpublishing applies identically to both. No internal IDs are exposed; the QR encodes only the opaque token.

### 4a. Public Intro reliability fix (Opera vs Chrome)

**Implemented, TESTING-validated, not yet formally accepted by Mazen** (see `PROJECT_HANDOFF.md` section 7g). A read-only diagnosis of a real-device report (the public Intro at `/@black` sometimes failed in Opera but not Chrome, temporarily recovering after "Delete Site Data") found two concrete risks: a still-unproven-safe parent/child handshake timing race, and GitHub Pages' unavoidable 10-minute asset cache allowing a stale build to keep running after a deploy. Both are now closed: the Intro iframe's readiness handshake is retry-based and acknowledged (works regardless of execution order, provably bounded, never duplicates playback), and every cross-document reference to the shared Intro iframe carries an automatically deploy-stamped version so a stale parent can never pair with a mismatched-version child. **Validated on Chromium-based tooling only — Mazen's manual acceptance on his real Opera browser is the outstanding final acceptance step.**

### 5. Social Links

**Approved direction — Requires Mazen approval**

Support user-controlled Snapchat, X/Twitter, Instagram, TikTok, YouTube, Twitch, Discord, and other links. Keep social URL, connected account, and API-verified gaming data distinct.

### 6. Gaming Connections Engine

**Approved direction — Requires Mazen approval**

Connect Discord, Steam, PlayStation, Xbox, Riot, and official game/platform APIs where available. Discord can support identity/discovery/linked accounts and permitted presence, but is not a universal stats/history/ranks/achievements source.

**Discord foundation implemented in TESTING (real Discord OAuth manually accepted by Mazen)** — see `PROJECT_HANDOFF.md` section 7h. A provider-neutral connection model plus Discord account linking (OAuth `identify` scope only, no stored tokens, private by default) and a CONNECTIONS area in YOUR GAMID. Steam, PlayStation, Xbox, Riot, game discovery, presence, and public display of connections remain unstarted and need separate approval.

**Riot discovery validation (implemented in TESTING; awaiting Mazen's real re-authorization)** — see `PROJECT_HANDOFF.md` section 7i. A small, private, diagnostic-only extension that also requests Discord's `connections` scope to learn whether `/users/@me/connections` returns a Riot Games entry and which safe fields it carries. It stores only the Riot result, never publishes it, and does not implement Riot OAuth/RSO, Riot API calls, OP.GG, or League rank/server/LP; those remain unstarted and need separate approval.

**Result:** Mazen's real authorization showed Discord returns **0 linked accounts**, so Riot cannot be discovered through Discord (dropped). **League of Legends prototype (implemented in TESTING; private, unverified, awaiting Mazen's acceptance)** — see `PROJECT_HANDOFF.md` section 7j. The owner enters a Riot ID once and GamID shows Solo/Duo rank, LP and wins/losses through an isolated, temporary, unofficial OP.GG adapter (lookups only on Add/Refresh, database-throttled, never public). It is designed so official Riot RSO + the Riot API can replace the adapter without redesigning the League card or data model. Public League visibility, other queues, and any official Riot integration remain unstarted and need separate approval.

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

**Phase 1 implemented in TESTING and ACCEPTED by Mazen** — see `PROJECT_HANDOFF.md` section 7l: a generic per-section "Show on my GamID" switch (Discord, League of Legends, Education & Work; OFF by default) and a server-enforced `public_sections` object in the public-safe boundary. The public visual expansion / cinematic profile and additional games remain unstarted and need separate approval.

**Steam Connection Foundation implemented in TESTING and ACCEPTED (real Steam sign-in completed by Mazen)** — see `PROJECT_HANDOFF.md` section 7m: Steam OpenID 2.0 as a second Gaming Connection (the authenticated SteamID64 only; private by default with its own switch). Steam library / game-ownership discovery, Marvel Rivals, and other providers remain unstarted and need separate approval.

**Steam My Games implemented in TESTING (blocked on the `STEAM_WEB_API_KEY` secret, then awaiting Mazen's real library check)** — see `PROJECT_HANDOFF.md` section 7n: owner-triggered, private discovery of the connected account's games through Steam's official API, stored provider-neutrally as `DISCOVERED_FROM_STEAM`; Marvel Rivals is only recognized. Marvel account/UID/rank/stats and verification, third-party sources, the generic Games / Game ID system, the Game ID Wall / Profile Canvas, and any public display of games remain unstarted and need separate approval.

**Canonical Game Catalog + manual game add (implemented in TESTING; `PROJECT_HANDOFF.md` section 7t):** GamID has ONE canonical Game Catalog (`game_key` is GamID's own id; Steam App IDs, IGDB / Epic / Wikidata ids are attributes; future Xbox / PlayStation / Riot ids will map the same way). In My Games, **+ Add Game** searches it server-side (3-character minimum, debounced, at most 10 suggestions, never downloaded), the owner ticks one or several platforms (PC, Steam, Epic, PS4/5, Xbox One/Series, Switch/Switch 2, iOS, Android; Steam and Epic are stores under PC), and the game joins the one My Games library. A manual game is **MANUAL / user-declared** (never verified or "discovered via"), merges into a provider-discovered row instead of duplicating it, can be edited or removed without ever touching provider discovery, and creates no stats or Game Profile. The catalog was imported from Wikidata and expanded in a second controlled pass (`PROJECT_HANDOFF.md` section 7u: 27,182 games, 102 normalized platforms from the PS1 / NES / Genesis era to the Switch 2, canonical and per-platform release years shown as "Game (1996)" in search, one set of rules for old and new games) (CC0, documented public interfaces, no key); IGDB would give better platform completeness but needs a key Mazen would create. Not started: Xbox / PlayStation / Discord game discovery, Marvel stats, W1.

**Public My Games implemented in TESTING (`PROJECT_HANDOFF.md` section 7w; awaiting Mazen's manual acceptance):** a visitor sees a compact MY GAMES section (at most six games + the true count) on the public GamID, **View all N games** opens the complete library with search over THAT identity's own games only, and every row (chevron) opens Game Details. Steam-discovered games show "Steam · Discovered", manual games "Manual · <platform>", a game that is both shows both on ONE row; nothing is ever labelled VERIFIED and Discord is not a game source. Three independent library-wide owner switches, all OFF by default: Show My Games, Show playtime, Show ranks & stats (no per-game switch); a switched-off value is absent from the server response, not hidden by CSS. League keeps PROTOTYPE / UNVERIFIED. Not started: filters, Xbox / PlayStation, IGDB, Marvel stats, W1.

**Public Profile responsive height / overflow fixed in TESTING and ACCEPTED by Mazen (`PROJECT_HANDOFF.md` section 7v):** the public GamID no longer behaves like a fixed viewport screen. The fixed full-viewport stage is used only while the Intro plays; once the profile shows, the page is normal document flow — the profile's iframe takes the height the profile reports, the provider panel (0 / 1 / many providers) and Replay Intro are ordinary blocks after the content, and the page scrolls. No magic heights; the owner Intro Preview is unchanged.

**Game ID Wall W0 risk prototype implemented in TESTING (isolated, throwaway) and tested on a real Samsung** — see `PROJECT_HANDOFF.md` section 7o. Final Samsung results: 3-stage continuous Wall, Overview and responsive width PASS; the two Samsung-found editor bugs (tiny/edge recovery, group resize) fixed and PASSED on re-test; Shape A vs B — no practical difference observed on that Samsung only; iPhone/iOS **NOT TESTED / DEVICE UNAVAILABLE**. Spotify/YouTube findings (technically renders ≠ acceptable product size; keep the video aspect ratio) are W1 inputs. W1, the Wall document model/DB and any production Wall remain unstarted and need separate approval.

**Implemented in TESTING from the backlog** (`PROJECT_HANDOFF.md` section 7p): (1) game lists are provider-neutral and collapsible (8 games by default, total count, chevron expand/collapse, safe for 200–300+ games); (2) game playtime/hours is hidden by default — a provider-neutral owner-only switch and a server gate exist; there is still no public game display; (3) the real Intro no longer distorts landscape videos: it preserves the source aspect ratio (cover only when ≥ 70 % of the picture survives, otherwise contain). **Landscape Intro follow-up (`PROJECT_HANDOFF.md` section 7q):** aspect ratio PASS on Samsung and PC; landscape/square sources now show a sharp, centered, size-capped foreground over an ambient glow taken from the same video (presentation only). Desktop softness is mainly D3 compression (≈ 1.1 Mbps for 1080p30); any media-policy change needs evidence, cost analysis and approval and was not made. **Provider-neutral expandable Game Profiles in My Games (foundation implemented in TESTING; `PROJECT_HANDOFF.md` section 7s):** any discovered game (Steam today; Discord, PlayStation, Xbox later) can optionally carry a small expandable Game Profile — but only when a real profile record is attached; discovery, game identity, stats provider, normalized profile and ownership/trust are kept separate, the same game from several providers resolves to one profile, profiles are private by default and cannot carry playtime. **No stats adapter exists yet:** MarvelRivalsAPI.com (unofficial, was returning 502) was not integrated, Tracker.gg was not scraped, and no fake data was created, so Marvel Rivals remains a plain "Discovered via Steam" row. **Still backlog:** the mobile optional-card / Bio overlap bug; SteamID64 is an internal identifier and should not be the normal public-facing Steam identity; new connected game/platform visibility stays private/OFF by default.

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
