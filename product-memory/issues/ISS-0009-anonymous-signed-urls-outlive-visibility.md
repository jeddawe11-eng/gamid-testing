---
id: ISS-0009
title: HIGH - anonymous visitors can mint long-lived signed Storage URLs that outlive PRIVATE / detach / unpublish
status: OPEN
created: 2026-10-10
updated: 2026-10-10
scope: Storage read access for visitors - Classic Profile Banner (confirmed, contained), public Avatar, Intro media, published Wall media (possible)
summary: HIGH severity. Any anonymous storage SELECT policy also lets visitors mint signed URLs of any length, and those URLs keep working after the condition that allowed them ends, until the object is deleted. Confirmed live for the Banner (contained in Phase 1C); possible for Avatar, Intro and Wall media by the same mechanism.
related: [DEC-0005, ISS-0007, ISS-0008]
save_approval: Mazen 2026-10-10
kind: BUG
authorization: NONE
truth_refs: [intro-streaming-f5, wall-visibility-toggle, public-wall-publishing, your-gamid-editor]
checkpoints: [f9929e5d2061667963942b3210dc59204613f007]
sources: [supabase/migrations/20261010130000_profile_banner_read_containment.sql, dist/account/supabase-client.js, PROJECT_HANDOFF.md]
---

## Description

**Severity: HIGH (privacy).** Supabase Storage's `POST /storage/v1/object/sign/<bucket>/<path>` signs any object the caller can SELECT under Storage RLS, and accepts any expiresIn the caller chooses. The resulting URL is checked only by its signature and expiry. Changing visibility, publication or attachment does not revoke it; deleting the object does.

So every storage SELECT policy granted to `anon` lets a visitor keep access past the moment the product says access ends.

## Evidence

- **Banner: CONFIRMED live**, then contained. Phase 1B on GM-TEST-01, 2026-10-10:
  - an anonymous signed URL with expiresIn of one year was accepted while the GamID was PUBLIC;
  - it still returned 200 after the GamID became PRIVATE, and after the Banner was detached;
  - it returned 400 only after the object was deleted.
- **Phase 1C containment:** migration `20261010130000` removed only "public profile banners are readable". Live, with a synthetic Banner on a PUBLIC GamID, these were all refused:
  - anonymous signing (one year and 60 s), and batch signing;
  - direct read, the public URL, render, info and listing;
  - signing and reading by another signed-in persona.
- **Avatar ("public identity avatars are readable"), Intro media ("public identity intro media are readable") and Wall media ("published wall media is readable"): POSSIBLE, high likelihood.**
  - Same mechanism; not live-tested, and no signed URL was created for any real user's file.
  - The public page itself already signs Intro and Wall video anonymously (`signPublicIntroMedia` and the anonymous Wall video signer in `dist/account/supabase-client.js`).
  - Their 120-second and 6-hour lifetimes are chosen by the browser only; the server accepted one year for the Banner.
  - Objects stay in place when a GamID goes PRIVATE, an Avatar is replaced (see ISS-0008) or a Wall is disabled / unpublished.
  - On TESTING, anonymous visitors can currently SELECT 3 Avatar, 3 Intro and 1 Wall video object.
- **NOT AFFECTED:** buckets without an anonymous SELECT policy (`intro-sources`, owner-only reads). Each owner can still sign their own files; that is owner choice, not visitor exposure.

## Resolution

Unresolved. The Banner is contained; any public Banner delivery must not use anonymous storage SELECT (the design is in PROJECT_HANDOFF.md §29). The Avatar, Intro and Wall surfaces are unchanged. A fix needs separate authorization: for example a controlled delivery function, or confirming each surface with a synthetic fixture first, which needs live-write approval.

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded as a HIGH-severity security issue in Phase 1C.
