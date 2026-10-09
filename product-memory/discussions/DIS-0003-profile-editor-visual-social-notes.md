---
id: DIS-0003
title: Profile Editor visual and social settings notes
status: CONCLUDED
created: 2026-10-09
updated: 2026-10-09
scope: Profile Editor desktop cards, account menu, save actions, social links
summary: Four design notes from Mazen's manual Profile Editor review, to be considered later without implementation authorization.
related: [DIS-0001, DIS-0002, IDEA-0001]
save_approval: Mazen 2026-10-09
supersedes: []
sources: [PROJECT_STATE.md, gamid-truth.json, product-memory/INDEX.md]
---

## Context

Mazen reviewed the Profile Editor and explicitly requested that notes be saved, with no implementation now.

## Discussion points

- Desktop Play Together and My Wall cards: improve text/button proportions, typography, spacing, wrapping and alignment after recent changes; preserve the mobile design unless broken. Avoid indiscriminate font shrinking.
- Account Settings: remove the standalone settings section; place **Language** and **Sign Out** only in the three-dot menu. Preserve existing section-level **Save Changes** and existing **Save All Changes** in its current position, **not** inside the menu. Save All Changes should cover all edited sections.
- Replace **IDENTITY BOARD · FUTURE** with **My Socials**, where users can add their own named-platform social links displayed as clickable icons on the public profile, including before creating a Wall. Social identity is distinct from free-form Wall links, which can reference other people or content.
- Evaluate the supported social platforms against those already available in Wall, including major global platforms. **No Other in My Socials**; retain existing **Other** within Wall. Users should be able to add, edit and remove social account links.

## Conclusion

These are approved-for-memory design notes, not implementation authorization. Preserve existing mobile UX and saving behavior until an implementation task is separately authorized.

## Reasoning

Separate stable profile identity from Wall content, simplify account settings navigation and improve desktop legibility while minimizing changes.

## History

- 2026-10-09 CONCLUDED — Mazen approved saving all four design notes, with no implementation.
