---
id: ISS-0007
title: Avatar upload validation trusts the client-declared MIME type
status: FIXED
created: 2026-10-10
updated: 2026-10-11
scope: Avatar upload through the usage-upload gateway (avatars bucket), direct and resumable (TUS) routes, and the Avatar reference RPCs
summary: For Avatar uploads the server checked only the Content-Type the client declared against the bucket list; the bytes were not checked for a real image signature, decodability or matching type. Fixed on TESTING - the gateway now stores only its own re-encoded square JPEG, refuses resumable Avatar uploads, and only such validated objects can become an Avatar.
related: [DEC-0005, ISS-0008, ISS-0009]
save_approval: Mazen 2026-10-10
kind: IMPROVEMENT
authorization: Mazen 2026-10-11, explicit task "GAMID — COMBINED SECURITY REMEDIATION + UX FIXES" (ISS-0007, TESTING only)
truth_refs: [your-gamid-editor, global-usage]
checkpoints: [a1d2eebd5355f8c2ad9c4d7d398348fa0d167cc7]
sources: [supabase/functions/_shared/usage-upload.js, supabase/migrations/20261011220000_avatar_validated_attach.sql, dist/account/avatar-cropper.js, tests/profile-banner-gateway.test.js, tests/avatar-upload-validation.test.js]
---

## Description

`reserve_usage_upload` accepted an upload when the declared `candidate_mime` was in `storage.buckets.allowed_mime_types`. The gateway passed the client's `Content-Type` header unchanged. Nothing read the file's signature (magic bytes), checked that it decodes, or tied the extension to the content. So any bytes up to 5 MiB, labelled `image/webp` for example, could be stored as an Avatar, and they were served anonymously once that Avatar was attached to a PUBLIC GamID.

## Evidence

- Phase 1A read-only audit (2026-10-09), static: `usage-upload.js` objects route and `reserve_usage_upload`.
- TESTING bucket configuration read live: `avatars` is private, 5 MiB, allows jpeg / png / webp / avif.
- Phase 1B added full decoding and re-encoding for Banner paths only and deliberately left the Avatar path unchanged. A live test (2026-10-10) confirmed an Avatar upload is still stored byte-for-byte.
- **Second route (security verification, 2026-10-11, read-only):** the resumable (TUS) creation route also accepted the `avatars` bucket, with only the type declared in the upload metadata; only Banner paths were refused there. No resumable Avatar upload had ever existed on TESTING (0 receipts).
- `attach_avatar` did not even check that the object existed; `update_my_identity_profile` checked existence and ownership only. So an unvalidated object stored before a fix could still have been attached afterwards.

## Resolution

FIXED on TESTING, checkpoint `a1d2eeb` (PROJECT_HANDOFF.md §38). Not VERIFIED: Mazen's acceptance is pending.
- **Gateway (`usage-upload` v8, deployed source identical to the repo):** an Avatar is accepted only as a direct POST to `<uid>/avatar-<uuid>.jpg` of a JPEG (declared and real) whose frame is square, 16-1024 px, read and bounded before decoding, that jpeg-js fully decodes in strict mode (bounded memory, end-of-image required). The gateway stores its own re-encoded JPEG (no metadata or trailing data survives) as `image/jpeg`, so the stored type, bytes and reserved size agree. Every refusal (`INVALID_AVATAR_TYPE`, `INVALID_AVATAR_SIZE`, `INVALID_AVATAR`, `INVALID_UPLOAD_PATH`, `CHUNK_TOO_LARGE`, `AVATAR_DECODER_UNAVAILABLE`) happens before any quota is reserved or anything is written. Banner processing shares the same code with unchanged behaviour.
- **Resumable route:** creating a resumable upload into `avatars` and continuing an earlier one are both refused (`AVATAR_REQUIRES_DIRECT_UPLOAD`); other buckets are unchanged.
- **Migration `20261011220000_avatar_validated_attach`** (rehearsed, applied after the gateway, history repaired): a new Avatar reference must be such a validated `image/jpeg` object owned by the caller and stored since the validating gateway went live (2026-10-11 09:23:17 UTC); the Avatar a GamID already shows is kept. No stored object was modified, re-encoded or deleted.
- **Browser:** the cropper and onboarding export a square JPEG (at least 16 px); JPG, PNG, WebP and AVIF can still be chosen.
- **Tests:** gateway refusals, valid images, limits, ownership, TUS refusal, decoder-missing, Banner unchanged; PGlite attach / profile-save rules; browser export. The outdated "Avatar bytes stored unchanged" test was replaced. Mandatory CI passed (run 38128281601).
- **Manual test (Mazen, 2026-10-11, TESTING):** a new Avatar saved through the Profile Editor and remained after a refresh, so the real browser path (cropper JPEG -> gateway decode / re-encode -> validated attach) works end to end. This is a successful functional test, not a complete security verification. The refusal cases are covered by automated tests and the deployed-source comparison; no adversarial upload was sent to TESTING.
- **Additional manual UI negative test (Mazen, 2026-10-11, TESTING): PASS.** Mazen selected a text file disguised as `fake-avatar.jpg` in the Avatar picker. The editor displayed “That image could not be opened. Choose another image.”, left Save Changes disabled, and continued showing “Avatar saved” for the existing Avatar. Screenshot supplied by Mazen. This confirms client-side invalid-image rejection only; it does **not** constitute a direct adversarial gateway upload or prove server-side refusal. No repeat of this UI test is needed.
- **Still open for VERIFIED:** Mazen's explicit security acceptance (and, if he wants it, a live adversarial upload check with a test persona).

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded in the Phase 1B task, without fixing it in that phase.
- 2026-10-11 AUTHORIZED — Mazen authorized the fix (both routes) and adding the resumable-route evidence, in "GAMID — COMBINED SECURITY REMEDIATION + UX FIXES".
- 2026-10-11 FIXED — Gateway v8, migration 20261011220000 and frontend a1d2eeb deployed on TESTING (run 38128281601). Not VERIFIED: Mazen's acceptance is pending.
