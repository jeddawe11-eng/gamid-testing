---
id: DEC-0006
title: Wall Icon Display Option & Icon Group
status: ACCEPTED
created: 2026-10-12
updated: 2026-10-12
scope: Wall Media & Links (all 14 platforms) - a new Icon display option, Single Icon and Icon Group, reusing the Classic My Socials icons
summary: Icon becomes an additional display option for every Wall Media & Links platform and URL kind, placed as a Single Icon or as an auto-aligned Icon Group; it reuses the Classic icons and the Wall's own link engine. Implemented at efac19e and accepted by Mazen on TESTING 2026-10-12.
related: [DEC-0002, DEC-0004, ISS-0013, REV-0006]
save_approval: Mazen 2026-10-12
authorization: Mazen 2026-10-12, explicit task "GAMID — Implement Wall Icon & Icon Group" (TESTING only)
acceptance: Mazen 2026-10-12 gave final manual acceptance on TESTING, confirming all functionality works - all 14 platforms, Single Icon, Icon Group, working links, correct icons, saving, and a vertical arrangement made with the existing responsive wrapping (no dedicated vertical layout control exists); implementation checkpoint efac19e, TESTING run 38204748089; record PROJECT_HANDOFF.md §49-§50
supersedes: []
truth_refs: [wall-icons, game-id-wall, public-wall-publishing, my-socials, discord-profile-card]
checkpoints: [efac19e6a99d1aac9893243603d1db824534aefa]
sources: [dist/wall-kit/embed/index.js, dist/wall-kit/embed/engine.js, dist/wall-kit/icons.js, dist/wall-kit/icons-paint.js, dist/wall-kit/platform-icons.js, dist/wall-editor/tools.js, dist/wall-editor/controls.js, dist/account/socials.js, dist/public/public.css, supabase/migrations/20261012120000_wall_icons.sql, tests/wall-icons.test.js, PROJECT_HANDOFF.md]
---

## Context

The Wall's Media & Links lists 14 platforms:
- the 11 media platforms: YouTube, TikTok, Twitch, Spotify, SoundCloud, Vimeo, Kick, Facebook, Snapchat, X, Instagram;
- Discord and Steam;
- Other.

Each platform offers the Player, Card and Link options its adapter supports. The Classic Profile already draws recognisable platform icons in My Socials (accepted; ISS-0013, REV-0006). Mazen wants the same icons on the Wall, alone or as a group, without aligning icons by hand.

An earlier request to copy the Classic Discord Profile Card into the Wall stopped at a blocker report and is now cancelled (see Decision F).

## Decision

**A. Icon display option.**
- Icon is an additional display option for all 14 Media & Links platforms.
- It covers every URL kind the Wall already supports; no platform is excluded.
- Each platform keeps its Player, Card and Link options exactly as its current capabilities allow.

**B. Reuse existing icons.**
- Use the Classic My Socials icons and branding.
- Use the existing Steam icon from Classic My Games.
- Use a generic link icon for Other.
- Do not invent a separate icon system unnecessarily, and preserve the accepted Classic appearance.

**C. Link handling.**
- Use the Wall's existing link engine and validation.
- Do not copy the My Socials restriction to account / profile links.
- Clicking an icon opens its associated validated URL.

**D. Single Icon.** One platform icon can be placed independently on the Wall.

**E. Icon Group.** Several platform icons inside one Wall element. The group:
- aligns its icons automatically and wraps them responsively;
- moves and resizes as one element;
- keeps each icon's own destination;
- never requires aligning individual icons by hand.

**F. Discord safeguard.**
- The unfinished task to copy the Classic Discord Profile Card into the Wall is CANCELLED.
- The investigation (2026-10-12) confirmed that attempt made no code changes and left nothing behind, so no rollback is needed.
- Existing Discord functionality in Classic, Connections and the Wall is preserved.
- Discord gets the Icon option like every other platform. This does not authorize any change to its Profile Card.

## Reasoning

- **One icon language for the Wall and the Classic Profile.** It avoids a second icon system and keeps the accepted branding.
- **The Wall's link engine as the only source of URL rules.** It already validates every supported kind (DEC-0002). Copying the Classic account-only rule would wrongly exclude videos, tracks and posts.
- **An Icon Group.** It removes manual alignment, the main cost of placing several icons on a free canvas.

Technical constraints noted for a future implementation; none prevents reuse:
- **Missing icons:** Steam and Other have no My Socials icon. The My Games Steam mark is reused, and Other needs one new generic link mark.
- **Shared stylesheet:** the Classic badge styles live only in the public profile stylesheet, which the Wall Editor does not load. They must move to a shared stylesheet without changing the Classic look.
- **One Wall variant:** some Classic marks exist only on desktop, while the Wall has a single variant.
- **Destinations:** they come from the Wall adapters, not the Classic address builder.
- **Data model:** Icon is a new display option, and Icon Group a new multi-link element. Both need Wall data-model, database-validation (migration), publishing and editor changes, and icon sizing must follow the Wall canvas.

## Alternatives considered

- **Icon only for account / profile URLs, the Classic My Socials rule:** rejected. Every platform and URL kind must be covered.
- **A separate Wall icon set:** rejected, to avoid duplicate branding and drift from the accepted Classic icons.
- **Icons placed only one by one:** rejected. A group must move as one element and align automatically.
- **Copying the Classic Discord Profile Card into the Wall:** cancelled; not part of this decision.

## Implementation

Authorized by Mazen on 2026-10-12 and implemented at `efac19e` (TESTING run 38204748089; migration `20261012120000_wall_icons.sql`, rehearsed and applied; PROJECT_HANDOFF.md §49):
- **Icon:** a new embed presentation for every kind of all 13 provider adapters, listed after the unchanged Player / Card / Link. Other can be shown as an Icon.
- **Icon Group:** a new `icons` element of 1-24 icons in the owner's order. Each icon is the parts of a platform link or an Other address, with optional size, spacing and alignment. The icons align, wrap and shrink together to fit the box.
- **Badges:** each provider adapter declares its Classic badge; there is a generic link icon for Other. The database mirrors the validator: the shared corpus matches 606/606.
- **Not implemented:** a dedicated vertical layout control. A vertical arrangement comes from the existing wrapping, by making the group's box narrow.

## Acceptance

Mazen gave final manual acceptance on TESTING on 2026-10-12, confirming that all functionality works. This covers all 14 platforms, Single Icon, Icon Group, working links, correct icons, saving, and the manually verified vertical layout produced by the existing responsive wrapping.
## History

- 2026-10-12 APPROVED — Mazen approved the Wall Icon / Icon Group design and its saving in Product Memory; implementation is not authorized.
- 2026-10-12 AUTHORIZED — Mazen explicitly authorized the implementation ("GAMID — Implement Wall Icon & Icon Group", TESTING only).
- 2026-10-12 IMPLEMENTED — Implemented at efac19e and deployed to TESTING (run 38204748089); migration 20261012120000 rehearsed and applied.
- 2026-10-12 ACCEPTED — Mazen gave final manual acceptance on TESTING: all functionality works.
