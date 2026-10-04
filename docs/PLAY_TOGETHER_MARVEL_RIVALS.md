# Marvel Rivals Play Now — TESTING
Baseline: d2a946691b7a7e2214107ebca38f6a095ae54b38.

Uses the existing game → experience → queue → region catalog and session RPCs.
Standard → Quick Match supports six total players (host + up to five seats).
Competitive is displayed but disabled by Mazen's decision until rank/placement rules are supported.
Arcade, rotating events and tournaments are not enabled in this slice.

Official evidence reviewed 2026-10-04:
- https://www.marvelrivals.com/guide/server/ — ten selectable server nodes.
- https://www.marvelrivals.com/news/20241205/40185_1198415.html — shared servers/platform play.
- https://www.marvelrivals.com/update/20240815/40955_1153551.html — core Quick Match / Competitive and six-player team format.
- https://www.marvelrivals.com/m/gameupdate/20251112/41548_1270590.html — Competitive party restrictions, including placements.
- https://www.marvelrivals.com/gameupdate/20260909/41548_1313441.html — Season 10.
- https://www.marvelrivals.com/gameupdate/20260923/41548_1314808.html — map-specific Quick Match event ended September 29; not added.
- https://www.marvelrivals.com/m/gameupdate/20260930/41548_1315568.html — current October 1 update.

Servers: Oregon, Dallas, Northern Virginia, Frankfurt, Warsaw, Dammam, São Paulo, Tokyo, Singapore, Sydney.
GamID chooses one common node for matching; users choose that server in Marvel Rivals.
Existing Riot region identifiers remain unchanged. Non-Riot rows leave those legacy fields null.
No new session/RLS/voice engine, no account/Wall edits, no new secrets or Edge Functions.
Migration adds catalog rows, allows null legacy Riot fields for other games, expands official source allowlist,
and adds game keys to catalog entries so the existing selectors can filter by game.

Validation: full node suite; lint/typechecks; tests/integration/play-together-marvel-rivals-db.sql
runs a disposable authenticated fixture and always rolls back.
