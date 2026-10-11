---
id: REV-0006
title: My Socials Spotify, SoundCloud and Vimeo - Mazen acceptance
status: COMPLETED
created: 2026-10-12
updated: 2026-10-12
scope: My Socials platform expansion - Spotify artist, SoundCloud profile and Vimeo profile accounts (checkpoint 9e6e765, migration 20261012100000)
summary: Mazen formally accepted the three added My Socials platforms on TESTING; the later mobile logo change (bc70717) is separate and not covered by this acceptance.
related: [REV-0005, ISS-0013, DEC-0002]
save_approval: Mazen 2026-10-12
review_type: ACCEPTANCE
outcome: PASS
reviewer: Mazen
truth_refs: [my-socials, classic-profile-desktop]
checkpoints: [9e6e765a6ccabe7fdd9a6687990678d1125365eb]
sources: [dist/account/socials.js, supabase/migrations/20261012100000_my_socials_spotify_soundcloud_vimeo.sql, tests/my-socials.test.js, PROJECT_HANDOFF.md]
---

## Subject

The My Socials expansion deployed to TESTING at `9e6e765` (run 38165131715, migration `20261012100000`), which brought My Socials to 12 platforms:
- Spotify: the owner's artist page;
- SoundCloud: the owner's profile page;
- Vimeo: the owner's profile page.

Tracks, playlists, albums, episodes, shows and videos are refused. The desktop Classic Profile shows the three brand marks.

## Method

Mazen's explicit acceptance in his task "GAMID — Final Acceptance + Mobile My Socials Icons" (2026-10-12). His manual test steps are not recorded here.

Before that, the agent ran the following technical checks, which are not acceptance:
- the full suite;
- a rolled-back server probe on the synthetic `gm_test_01` fixture;
- a visitor-only desktop and mobile check of `/@black` (PROJECT_HANDOFF.md §47).

## Results

PASS: the three platforms are accepted, within the scope of `9e6e765`.

## Follow-up

- **Mobile logos:** at `9e6e765` the three new icons showed a plain text badge on mobile. Mazen authorized giving them their logos on mobile as well, which was deployed separately at `bc70717` (PROJECT_HANDOFF.md §48). That change is not part of this acceptance.
- **Other platforms:** their accepted mobile text marks are unchanged.

## History

- 2026-10-12 COMPLETED — Mazen formally accepted Spotify, SoundCloud and Vimeo in My Socials.
