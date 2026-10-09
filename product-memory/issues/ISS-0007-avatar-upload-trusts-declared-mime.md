---
id: ISS-0007
title: Avatar upload validation trusts the client-declared MIME type
status: OPEN
created: 2026-10-10
updated: 2026-10-10
scope: Avatar upload through the usage-upload gateway (avatars bucket)
summary: For Avatar uploads the server checks only the Content-Type the client declares against the bucket list; the bytes themselves are not checked for a real image signature, decodability or matching type.
related: [DEC-0005]
save_approval: Mazen 2026-10-10
kind: IMPROVEMENT
authorization: NONE
truth_refs: [your-gamid-editor, global-usage]
checkpoints: []
sources: [supabase/functions/_shared/usage-upload.js, supabase/migrations/20261004170252_global_usage_gateway.sql]
---

## Description

`reserve_usage_upload` accepts an upload when the declared `candidate_mime` is in `storage.buckets.allowed_mime_types`. The gateway passes the client's `Content-Type` header unchanged. Nothing reads the file's signature (magic bytes), checks that it decodes, or ties the extension to the content. So any bytes up to 5 MiB, labelled `image/webp` for example, can be stored as an Avatar, and they are served anonymously once that Avatar is attached to a PUBLIC GamID.

## Evidence

- Phase 1A read-only audit (2026-10-09), static: `usage-upload.js` objects route and `reserve_usage_upload`.
- TESTING bucket configuration read live: `avatars` is private, 5 MiB, allows jpeg / png / webp / avif.
- Phase 1B added full decoding and re-encoding for Banner paths only and deliberately left the Avatar path unchanged. A live test (2026-10-10) confirmed an Avatar upload is still stored byte-for-byte.

## Resolution

Unresolved; record only. A future fix could reuse the Banner approach for Avatars. Do not implement without separate authorization.

## History

- 2026-10-10 OPEN — Mazen asked for it to be recorded in the Phase 1B task, without fixing it in that phase.
