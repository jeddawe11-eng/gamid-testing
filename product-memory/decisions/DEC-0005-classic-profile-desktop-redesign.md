---
id: DEC-0005
title: Classic Profile desktop redesign (Banner, About Me, desktop layout)
status: AUTHORIZED
created: 2026-10-10
updated: 2026-10-10
scope: Classic Profile (/@<handle>) at 1280px and wider, Profile Editor (Banner, About Me), Discord section presentation
summary: A wide desktop Classic Profile with an owner-uploaded 6:1 Banner, About Me fields and a main-content / sidebar layout, built only from real GamID data; mobile, the Intro engine, Full Preview and Wall behaviour stay unchanged.
related: [DEC-0004, DEC-0003, DEC-0001, IDEA-0001, ISS-0007, ISS-0008, ISS-0009]
save_approval: Mazen 2026-10-10
authorization: Mazen 2026-10-10, Phase 1B only ("Classic Profile Banner — Phase 1B — Secure Storage & Backend Implementation", TESTING only); Phase 1A (read-only audit) before it
supersedes: []
truth_refs: [public-my-games, public-section-visibility, discord-profile-card, my-socials, public-wall-publishing, wall-visibility-toggle, intro-transition-engine, your-gamid-editor]
checkpoints: []
sources: [PROJECT_HANDOFF.md, supabase/migrations/20261010120000_profile_banner.sql, supabase/functions/_shared/usage-upload.js]
---

## Context

Mazen approved a desktop mockup for the Classic Profile. A read-only audit (2026-10-09) found that about half of its elements have no GamID data behind them: Friends, Teams, Achievements, game covers, search, messaging, Discover, tabs and an About Me text block. The audit also found that the current profile card is the end state of the accepted Intro frame (`account/intro-preview.html`), which owner Full Preview shares. A technical plan (2026-10-10) proposed isolating the desktop view through the frame's existing, accepted `hostReveal` mode, which the published Wall already uses.

## Decision

Approved product decisions (Mazen, 2026-10-10):

1. **Breakpoint:** the desktop redesign applies at 1280px and wider. Below that, everything stays as it is.
2. **Banner:** ratio 6:1, saved at 1920×320. The uploaded source may be at most 5 MB, in JPEG, PNG, WebP, GIF or AVIF. GIF is accepted but shown as a static first frame in V1. There are crop and position controls, and a default gradient appears when no Banner exists.
3. **Banner visibility:** desktop only. Mobile stays visually and functionally unchanged.
4. **Discord section:** the separate Discord section leaves the **desktop** Classic Profile only. The mobile section, Discord data, visibility controls, OAuth and the accepted My Socials Discord Profile Card (DEC-0004) are kept.
5. **Member Since:** the year of the GamID's `entities.created_at`, shown on public profiles.
6. **About Me:**
   - optional Location: city or country typed by the owner, at most 60 characters, never geolocated;
   - optional Languages, at most 5;
   - optional Favorite Genres, at most 5.
   - Each is hidden by default and appears only after an explicit public opt-in.
7. **Game count:** the real game count appears in the desktop hero only when My Games is public.
8. **Banner storage:** reuse the existing `avatars` bucket **only if** these are proven first: server-side 5 MB enforcement, secure file validation, usage accounting, and that a PRIVATE profile's Banner cannot be read. If any of them is not proven, stop and report the blocker before changing storage.
9. **Kept as they are:**
   - My Games source labels, including Manual;
   - the accepted Intro engine and Full Preview;
   - Wall behaviour (a published, enabled Wall replaces the Classic Profile; Enable / Disable My Wall);
   - the mobile layout.
10. **Out of scope:** Friends, Teams, Achievements, game covers, search, messaging, Discover and any other unsupported mockup element.

Proposed implementation choices, approved as part of the plan, not yet built:

- Desktop isolation through `hostReveal`, with no change to `intro-preview`.
- A dedicated anonymous reader for the new public data, instead of changing `get_public_identity`.
- Owner-only Banner and About Me RPCs; clearing a value turns its public switch off.
- The Banner is re-encoded in the browser (EXIF removed) and attached before the old one is deleted.

## Reasoning

- Real data only, so the profile never shows invented statistics or text.
- Reusing `hostReveal`, an accepted Wall path, keeps the Intro engine and Full Preview untouched.
- Keeping the old layout below 1280px, and the Discord section on mobile, keeps mobile exactly as accepted.
- The storage condition keeps the accepted upload gateway and the Avatar path untouched unless reuse is proven safe.

## Alternatives considered

- Redesign inside the Intro frame — rejected: it would change the accepted Intro engine and owner Full Preview.
- Implement the whole mockup, including Friends, Teams, Achievements and covers — rejected: no data exists, and showing it would mean placeholder or invented data.
- Animated GIF Banners in V1 — deferred: decoding cost and bandwidth, and they would need the original file or a server worker.
- Remove the Discord section on every screen size — rejected: mobile must stay unchanged.

## History

- 2026-10-10 APPROVED — Mazen approved the product decisions above (Phase 0, documentation only). Implementation is not authorized: Phase 1 needs his explicit approval.
- 2026-10-10 AUTHORIZED — Phase 1A security audit, then Phase 1B (storage and backend only) authorized by Mazen. Architecture: Banner stored as a gateway re-encoded JPEG at avatars/<uid>/banner/<uuid>.jpg (replacing the planned WebP output); owner compare-and-set attach / remove; anonymous read only of an attached Banner of a PUBLIC GamID; attached Banners cannot be deleted; the gateway accepts only a direct POST, fully decodes it with the trusted jpeg-js 0.4.4, requires exactly 1920×320, re-encodes so no metadata survives, and refuses before any reservation. Phase 1B was then halted at a mandatory stop condition. Migration 20261010120000 was rehearsed (16/16) and applied, usage-upload v6 deployed, and GM-TEST-01 tested live. While the GamID was PUBLIC an anonymous visitor could mint a signed Storage URL valid for one year; that URL still served the Banner after the GamID became PRIVATE and after the Banner was detached, and only deleting the object stopped it. GM-TEST-01 was restored and no Banner is attached on TESTING. Not implemented, not accepted (PROJECT_HANDOFF.md §28). Phase 1C containment (Mazen authorized, 2026-10-10): migration 20261010130000 removed only the anonymous Banner read policy; rehearsal 8/8; live 18/18 with a synthetic Banner on a PUBLIC GamID (anonymous signing, batch signing, direct, public, render, info and listing all refused, and another signed-in persona refused); the owner can still read and sign their own Banner. Public delivery must go through a controlled Edge Function (designed in PROJECT_HANDOFF.md §29, not built). Risks of the same kind for Avatar, Intro and Wall are tracked in ISS-0009.