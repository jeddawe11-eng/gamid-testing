# Universal Delete UX & Reference Cleanup (2026-10-21)

Mazen's task: "GAMID — UNIVERSAL DELETE UX & REFERENCE CLEANUP, ONE COMPLETE IMPLEMENTATION TASK" (TESTING only).

Branch `feature/universal-delete-ux`, based on `feature/f8b1-video-renditions` at `1f7d203`.

**Status: ACCEPTED ON TESTING** (2026-10-21). Site `da4cc5a` (run `39616006123`; previously `54e3b43`, run `39595702093`), migrations `20261022100000` and `20261022110000` applied, `usage-upload` v13. Not merged. Revised by Mazen the same day: every permanent deletion is confirmed, and the interface is silent (§11). Mazen accepted the final signed-in deletion confirmation and silent behavior on 2026-10-21; §10–§11 contain the verification scope.

## 1. The contract

| The resource is… | What happens |
|---|---|
| **NOT IN USE** | A simple confirmation: "This image is not currently in use. Are you sure you want to permanently delete it? This action cannot be undone.", with **Cancel** / **Delete image**. No usage list. *(Revised 2026-10-21; it was deleted at once before, §11.)* |
| **IN USE** | The detailed confirmation: the name, where it is used, what deleting it does, the published Wall, the permanent-deletion warning, and **Delete** / **Cancel**. Cancel has the focus. |
| **CONFIRM** | It is deleted, and every reference to it is removed. |
| **CANCEL** | Nothing changes, and nothing has been sent. |

"In use" is decided from three sources:
- the Wall being edited, unsaved edits included;
- the **saved draft**;
- the **published Wall**.

The last two are authoritative and persisted, and the server checks them in the same transaction that deletes.

So:
- an asset placed only in unsaved edits gets the detailed confirmation;
- an asset removed in the editor but still present in the saved draft gets the detailed confirmation too;
- if a deletion confirmed as unused turns out to be used by the server (an older published Wall, another tab), nothing is deleted and the same dialog switches to the detailed confirmation.

## 2. Deletion-surface inventory (audit)

| Surface | Resource | Before | Now |
|---|---|---|---|
| Wall Editor › **Assets** (desktop and phone: the same panel) | Wall images, GIFs, MP4/WebM videos, converted `.h264.mp4` | Delete was refused while in use ("Remove it from the Wall first"). | Universal rule |
| Wall Editor › **Background** › Images / Videos (desktop and phone) | The same assets | In use: no Delete was offered. Unused: an inline confirmation. | Universal rule. "In use: …" is still shown beside Delete. |
| Wall Editor › Text › **My Fonts** (desktop only, as before) | Custom fonts | A double-click "Delete?", then a refusal if used. | Universal rule. Texts fall back to their library font. |
| Video renditions (F8-B1) | Internal | Not user-deletable | Unchanged. A deleted video's rendition detaches (`ON DELETE SET NULL`) and leaves through the existing sweep. |
| HEVC source originals | Internal | `wall_video_jobs` lifecycle | Unchanged |
| Wall stage (Stages bar) | A stage | Always confirmed (accepted contract `stages-bar-global`) | **Unchanged: an exception for Mazen (§5)** |
| Wall elements / layers | Element | Undoable delete, no confirmation | Unchanged. These are not stored resources: Undo restores them. |
| Unpublish Wall | Publication | `window.confirm` | Unchanged. Reversible; not a resource deletion. |
| My Crew › Delete Crew | Crew | Always confirmed with a warning | Unchanged. Consistent: a Crew always has members, so it is always "in use". |
| Intro / Banner / Avatar remove | Media | Staged, applied by Save | Unchanged. No cross-references; the Save is the confirmation. |
| My Socials, favourites, roles | Settings | Draft edits | Not a deletion surface |
| Templates | System catalog | Not deletable | Not a deletion surface (protected) |
| Usage Center | — | No delete UI | Not a deletion surface |
| Crew Walls | — | Reference no Wall assets or fonts | Not affected |

## 3. Behaviour by resource type

### Images, GIFs and videos

On confirm, one database transaction does the following:
1. It removes the Whole Wall background, any stage background, and every element whose payload names the asset. This happens in the saved draft (only at the revision the editor holds) and in the published snapshot.
2. It validates both documents.
3. It deletes the asset row.

Nothing else changes: other elements, groups, z-order, stage settings and other assets stay as they are.

The rule for an up-to-date publication:
- A publication that was up to date stays up to date: its `draft_revision` follows the new revision.
- An older publication is cleaned but keeps its revision.

Visitors therefore never meet a broken reference.

After the transaction, the file goes through the existing usage gateway, as before. The client tries 3 times, and a 404 counts as gone.

### Fonts

**On confirm:**
- every text keeps its words, position, group and other styling;
- only `fontRef` is removed, so the text draws with the catalog `fontFamily` it always kept. This is the existing fallback in `wall-kit/custom-fonts.js`.

The draft's font-reference trigger accepts the result. The registry row is deleted, and the slot is freed.

**The confirmation warns that the text's appearance changes.** It names the library font or fonts the texts will use.

### The editor

On success, `session.rebase(revision, transform)` applies the same transform in three places:
- to the document being edited;
- to the saved baseline;
- to every undo and redo snapshot.

This has three effects:
- the owner's other unsaved edits stay exactly as they were, and stay unsaved;
- the status "Saved" stays "Saved";
- Undo can never bring back a deleted reference.

The editor transforms (`ops.removeAssetReferences` and `ops.removeFontReferences`) are tested to equal the database transforms on the same documents.

### Safety

**Concurrency:**
- the resource, draft and publication rows are locked with `FOR UPDATE`;
- fonts also take the per-account usage lock;
- the client allows one deletion at a time across all panels;
- the dialog's Delete runs once, and Cancel is disabled while a deletion runs.

**Stale editor:** if the saved draft moved on (for example, another tab saved it), the result is `WALL_REVISION_CONFLICT` and nothing changes. While a save is running, the dialog asks the owner to wait. A conflict or blocked state refuses the deletion.

**Unknown outcome (lost connection):** the editor re-reads the authoritative list before reporting anything.
- If the asset or font is gone, its references are removed locally. If nothing else is unsaved, the server draft is reloaded; otherwise the next Save shows the normal "newer version" choice. Nothing is overwritten silently.
- If it is still there, the message says nothing changed.

**Defensive check:** if a reference sits in a place the transform does not know, the deletion aborts with `WALL_REFERENCE_UNRESOLVED`. Nothing is left dangling.

**Ownership:** the owner comes from `auth.uid()`. Another account gets `*_NOT_FOUND`, and `anon` gets no execute right. The transforms are not callable by any client.

**After a deletion:**
- the publish status refreshes;
- Usage counts follow through the existing `usage_wall_changed` triggers;
- a limit or quota upload error clears.

### The confirmation dialog

The confirmation is a native modal `<dialog>` in the top layer, so no panel, drawer or bottom sheet can clip or cover it.

**Screen sizes:** it is checked at 1280×800, 375×812 and a short 740×360 landscape:
- 16 px gutters, with no horizontal scroll;
- long names wrap;
- it scrolls inside itself;
- Delete and Cancel stay pinned in view.

**Keyboard:** Escape means Cancel, and Cancel has the focus.

**Motion:** none.

## 4. Changed files

- `supabase/migrations/20261022100000_universal_delete_resolve.sql` (new, additive). It adds:
  - `wall_document_strip_asset` and `wall_jsonb_strip_font_ref`;
  - `delete_my_wall_asset_resolving` and `delete_my_wall_font_resolving` (owner RPCs).

  The old refusing RPCs stay, for cached pages. Rollback: drop the six functions.
- `dist/account/supabase-client.js`:
  - `deleteWallAssetResolving` and `deleteWallFontResolving` (RPC, then the gateway file delete with retry);
  - the old `deleteWallAsset` and `deleteWallFont` are removed, leaving one path.
- `dist/wall-editor/delete-flow.js` (new): the one flow and its dialog.
- `dist/wall-editor/tools.js`: Assets, Background and My Fonts are wired to the flow. The panel-local confirmations and refusals are removed.
- `dist/wall-editor/assets.js` and `dist/wall-editor/font-store.js`: `deleteResolving` and `has`. The old `remove` is removed.
- `dist/wall-kit/ops.js`: `removeAssetReferences`, `fontUsage` and `removeFontReferences`.
- `dist/wall-kit/session.js`: `rebase`.
- `dist/wall-kit/history.js`: `rewrite`.
- `dist/wall-editor/editor.js`: refreshes the publication after a deletion.
- `dist/wall-editor/editor.css`: the dialog, and the removed inline-confirm styles.
- `package.json`: typecheck.
- Tests:
  - `tests/universal-delete-db.test.js` (9 tests);
  - `tests/universal-delete-ux.test.js` (13 tests);
  - deliberate updates to the guard tests that pinned the superseded "in use → no Delete / refuse" rule: `wall-background-controls`, `wall-custom-fonts`, `wall-editor-background-desktop`, `wall-w4-media`, `upload-feedback`, and the pinned list in `public-my-games`.

## 5. Decisions (Mazen, 2026-10-21)

1. **Stage delete keeps its confirmation**, including for an empty stage. It is intentionally exempt from the immediate-delete rule, and the accepted Stages contract (`wall-editor-stages-bar`) is unchanged.
2. **Safe orphan cleanup: approved and built** (§9).
3. **The published Wall changes immediately** when an in-use resource is deleted on confirmation. This follows the contract, and the dialog states it.
4. **The old refusing RPCs** `delete_my_wall_asset` and `delete_my_wall_font` remain on the server for pages cached before the deploy. The current site no longer calls them. Removing them can be a later clean-up.

## 6. Validation (the 12 required items)

| # | Item | Evidence |
|---|---|---|
| 1 | Unused asset: simple confirmation, then deleted (revised, §11) | DB "1 / 6"; UX "1 / 2 / 3 unused asset"; TESTING step 1 (the server call) |
| 2 | Used background: warning, then confirm | DB "2 / 3 / 4"; UX "2 / 3 / 4"; TESTING steps 2 and 5–6 |
| 3 | Used stage image or video | Same, including a `media: "video"` layer |
| 4 | Multi-reference asset | 4 placements across 2 stages, plus the publication |
| 5 | Used font: warning, then fallback | DB "5"; UX "5"; TESTING step 7 |
| 6 | Unused font: simple confirmation, then deleted (revised, §11) | DB "1 / 6"; UX "5 / 6"; TESTING step 8 (the server call) |
| 7 | Cancel | UX "7 cancel"; dialog Escape and Cancel |
| 8 | Failure leaves no inconsistent state | DB "8"; UX "8"; TESTING step 3 |
| 9 | Permissions | DB "9" and "shape"; TESTING steps 4 and 9 |
| 10 | Storage cleanup and Usage | UX client test; orphan tests (§9); TESTING steps 11–20 |
| 11 | Desktop and mobile layouts | Dialog lab at 3 sizes; the shared panels |
| 12 | Editor and visitor non-regression | Full suite; TESTING visitor check (step 10) |

Full suite at `54e3b43`: 2129 tests, 0 failures (2 pre-existing skips). `npm run lint` and `npm run typecheck` are clean. Truth and Product Memory validation pass.

## 7. TESTING deployment (2026-10-21, authorized by Mazen)

- **Target:** Supabase project `upvtrczefcvigxdyuylw` (TESTING), the same ref the site's client uses, and the Cloudflare TESTING Worker through the existing workflow. Production was not touched.
- **Rehearsal:** both migrations were run against the live schema in one transaction ending with `ROLLBACK`.
  - The delete-check patch applied, and the fonts line was kept.
  - The transforms left all 5 live drafts and 2 publications unchanged for an unused id.
  - The cleanup would have claimed 0 files.
  - Afterwards, nothing was left behind.
- **Migrations** `20261022100000_universal_delete_resolve` and `20261022110000_usage_media_orphans` were applied with `db query`, and recorded with `migration repair --status applied`.
  - 11 functions are present.
  - `authorize_usage_delete` refuses registered Wall files and keeps its font and Intro protections.
  - `anon` cannot execute the delete RPCs; `authenticated` cannot call the orphan RPCs.
- **Edge Function:** `usage-upload` went from v12 to **v13**, with `verify_jwt` still false (as in `supabase/config.toml`). Smoke: an unauthenticated cleanup call returns 401 `AUTH_REQUIRED`.
- **Site:** run `39595702093` (success, validation and smoke passed) from `feature/universal-delete-ux` at `54e3b439b96c3dabd228840dc2045596455705fd`.
  - The live stamp reads `54e3b43`.
  - The deployed editor modules are identical to the tested ones (`session.js` differs only in line endings).
- **Rollback:**
  - redeploy the site from `feature/f8b1-video-renditions` at `764e3b8`;
  - roll `usage-upload` back to v12;
  - drop the new functions and the attempts table, and remove the `WALL_ASSET_REGISTERED` line from `authorize_usage_delete`.

## 8. GamID Truth

- New capability `wall-universal-delete`, at PENDING_ACCEPTANCE, with checkpoint `54e3b43`. Its contracts: `universal-delete-rule`, `-media-resolution`, `-font-resolution`, `-safety` and `-orphan-cleanup`, plus its limits.
- `custom-wall-fonts`: the `custom-font-delete` contract now states the universal rule; its checkpoint is `54e3b43`.

The accepted capabilities (`game-id-wall`, `global-usage`, `wall-editor-stages-bar`, `wall-video-renditions`) are unchanged.

## 9. Safe orphan cleanup (approved 2026-10-21)

**The gap.** The asset row is deleted first. If every gateway delete of its file fails, the file stays in the owner's folder and counts toward the 200 MB.

**Reuse.** The fix uses no new system. It adds one step to the owner's existing Usage cleanup route (`POST /usage-upload/cleanup`), the same pattern as `usage_font_orphans`. That route runs:
- when Usage opens;
- on Intro actions;
- and now also when the Wall editor opens.

**Detection** (`private.wall_media_orphan`, from authoritative server state). A file is an orphan only when all of these hold:
- it is in the owner's own folder, in `wall-media`, `wall-video` or `wall-video-derived`;
- it is provably the owner's, by the same rule `authorize_usage_delete` uses;
- it was created more than 1 hour ago;
- no asset row names it;
- no upload receipt for it is ACTIVE or changed in the last hour;
- it is not a conversion source still awaiting its lifecycle delete, nor an in-flight or failed conversion output.

A READY conversion's output is a Wall asset, so it becomes an orphan only once that row is gone. Renditions, Intro, Avatar, Banner and font files are never considered.

**Bounded tries** (`claim_wall_media_orphans`, under the per-account usage lock):
- at most 10 files a run;
- each try is recorded in `private.usage_media_orphan_attempts`;
- at most 5 tries per file, at least 15 minutes apart;
- a record is forgotten once its file is gone.

**Re-check.** `authorize_wall_media_orphan_delete` runs right before removal. It repeats the full existing delete check, then the orphan rule, so a file registered since the claim is kept.

**Failure isolation.** One refusal or storage failure never stops the others; the route reports `media` and `mediaFailed`. A foreign path or a bucket outside the three stops the run before anything is deleted.

**Hardening.** `authorize_usage_delete` (an asserted in-place patch) now refuses a registered Wall asset's file from every caller (`WALL_ASSET_REGISTERED`). Every existing caller deletes a Wall file only after its row is gone, or for a file that was never registered.

**Files and tests:**
- `supabase/migrations/20261022110000_usage_media_orphans.sql`;
- `supabase/functions/_shared/usage-upload.js` (cleanup step);
- `dist/wall-editor/editor.js` (cleanup on open);
- `tests/usage-media-orphans.test.js` (8 tests): detection, protected objects, bounded tries and back-off, forgetting, Usage bytes, the re-check, the hardened check, grants, route isolation, the trigger;
- pinned cleanup responses updated in `intro-storage-lifecycle`, `usage-upload` and `wall-custom-fonts`.

## 10. TESTING E2E (GM-TEST-01, synthetic media only, 2026-10-21)

**Method.** The established one:
- the owner RPCs ran as GM-TEST-01 by setting its user id in the SQL session (no sign-in);
- the service RPCs ran as `service_role`;
- synthetic files were uploaded with the CLI into GM-TEST-01's own folders: 2 tiny PNGs, the 2.8 KB fixture MP4, and 2 bundled WOFF2 fonts.

They were registered through the real registration RPCs. A Wall was saved through `save_my_wall_draft` (the real W1 validator) at revision 2, then published. The Wall used:
- the image as the Whole Wall background and on both stages;
- the video as the Stage 1 background and as a Stage 2 layer;
- the font on 2 texts, one of them grouped.

GM-TEST-01 was made PUBLIC only for the visitor check.

| Step | Result |
|---|---|
| 1 unused image, server call with resolve=false (since §11 sent only after the simple confirmation) | Deleted. The draft and publication were unchanged (same md5, revision 2). |
| 2 used image, no confirm | `deleted=false`, `in_draft` and `in_published` true; nothing changed. |
| 3 used image, stale revision | `WALL_REVISION_CONFLICT`; nothing changed. |
| 4 gateway delete of a registered file | `WALL_ASSET_REGISTERED` |
| 5 confirm image (revision 2) | Deleted. Draft and publication went to revision 3 together; both backgrounds and both image layers were removed. |
| 6 confirm video (revision 3) | Deleted. Revision 4; the Stage 1 background and the video layer were removed. |
| 7 font, then confirm (revision 4) | First `deleted=false` (in use), then deleted at revision 5. Both texts lost only `fontRef`. |
| 8 unused font, resolve=false | Deleted; revision unchanged. |
| 9 unknown identity | `IDENTITY_NOT_FOUND`; nothing changed. |
| 10 anonymous visitor Wall | Valid by the W1 validator and **exactly equal** to the editor's transforms of the original. No deleted id appears; no assets or fonts are exposed. Texts kept their words, position, group and library font (`bebas-neue` / `orbitron`). |
| 11–12 file deletes after the rows were gone | The gateway check passed for all 4. Only the deliberately left-behind image remained, counting 74 B. |
| 13 orphan within the grace period | Not claimed. |
| 14–20 orphan after the grace period (the synthetic file and receipt backdated by 2 h) | Claimed once, not again within the back-off, 1 try recorded, the re-check passed. Then removed; the record was forgotten; Usage stored bytes went to **0**. |
| F8-B1 | The rendition foreign key is still `ON DELETE SET NULL`; the rendition bucket is never considered by the cleanup. |

**Restored.** GM-TEST-01 is identical to its recorded baseline:
- SOLO, DRAFT;
- draft revision 1, md5 `1b12bc34…`;
- no publication;
- 1 asset row (the known dangling row);
- 0 fonts, 0 objects, 41 receipts, 0 jobs and renditions, 0 bytes.

The local synthetic files were removed. No real account (`@black`, `@zshot` or any other) was read or changed.

**Not verified on TESTING (needs Mazen, signed in).** I never sign in as a persona, so the following are covered by unit tests and the dialog lab only:
- the editor UI on the live site: the dialog, Undo after a deletion, the Stages bar confirmation, and the phone and desktop panels;
- the gateway's cleanup route called with a real owner session. Its database steps were run directly on TESTING, and the route itself is unit-tested and smoke-tested (401).

**Acceptance checklist for Mazen** (GM-TEST-01 or his own account):
1. In Assets, Delete an unused image: the simple confirmation appears ("not currently in use"); Cancel keeps it; Delete removes it.
2. Delete a used one: the dialog lists where it is used. Cancel changes nothing; Delete removes it everywhere, and Undo does not bring it back.
3. In the Background panel, do the same with an image and a video.
4. In My Fonts, delete a used font: the texts switch to their library font.
5. Delete an empty stage: it still asks.
6. Repeat 1–2 on a phone.
7. Open Usage: the counts follow.
## 11. Revision: every deletion is confirmed; silent interface (Mazen, 2026-10-21)

### Every permanent deletion asks first

**What changed.** An unused image, GIF, video or custom font is no longer deleted at once. It gets a simple confirmation:
- "Delete this image?";
- its name;
- "This image is not currently in use. Are you sure you want to permanently delete it? This action cannot be undone.";
- **Cancel** / **Delete image**.

There is no usage list and no usage warning. A used one keeps the detailed confirmation (§1).

**What decides it, before anything is sent.** The editor checks four sources:
- the Wall being edited;
- the saved draft it holds (`session.savedDocument`);
- for fonts, My Fonts' own `in_draft` / `in_published`;
- for assets, the published Wall's use, which only the server knows.

**The server is still the judge.** A deletion confirmed as unused is sent with `resolve = false`, so the server deletes it only if it is still unused. If the server finds it used, nothing is deleted and the same dialog switches in place to the detailed confirmation ("Nothing was deleted yet: it is still in use, as listed above."). The owner then chooses again.

**Guaranteed in tests:**
- Cancel sends nothing.
- The server is asked to delete only from inside a confirmation's Delete (a static check: the flow has exactly two such calls).
- Stage deletion keeps its own confirmation, and canvas element removal and its Undo are unchanged.
- All the safety properties of §3 stay as they were: one transaction, revision conflicts, permissions, published / draft consistency, font fallback, unsaved edits, Undo rewritten, orphan cleanup.

**Surfaces:**
- Assets (desktop and phone);
- Background › Images / Videos (desktop and phone);
- My Fonts (desktop only, as before).

**Layout.** Checked in the dialog lab at 1280×800 and 375×812: the simple dialog, and the in-place switch to the detailed one (focus returns to Cancel).

**Files and tests:**
- files: `dist/wall-editor/delete-flow.js` (the decision and both dialog variants), `dist/wall-kit/session.js` (`savedDocument`), and comments in `dist/wall-editor/tools.js`;
- `tests/universal-delete-ux.test.js`: 18 tests (unused → simple confirmation, cancel, confirm; removed here but still saved; the server finds it used → detailed in place; fonts unused / published-only; both dialog variants; the static check).

**Deployment.** No migration and no Edge Function change. Site `da4cc5a2f1ad785260309cb6022cdebbba6a6dd1`, run `39616006123`; stamp verified, and the deployed modules are identical to the tested ones.

### Silent interface (temporary policy)

**Audit** of every shipped file under `dist/`. There is **no application-owned UI sound** and no audio infrastructure:
- no `<audio>`, `new Audio`, Web Audio (`AudioContext`) or oscillator;
- no sound file;
- no speech synthesis, no vibration;
- no system notifications (`new Notification` / `showNotification`).

Delete, save, upload, notifications (the in-app bell and toasts), dialogs, buttons, menus and navigation are already silent. Nothing had to be switched off, and nothing was removed.

**Where GamID creates a `<video>`:**
- the Intro player (`#introVideo`, Intro preview): **keeps its audio** (exempt, unchanged and verified live);
- the Intro preview's split / ambient clones: muted;
- the Intro source duration probe: metadata only, never played;
- the editor-media frame capture: muted;
- the asset upload probe: muted;
- video thumbnails: muted, never played;
- Wall background videos and video layers: always muted.

**User and provider media** are not changed by this policy and are reported only: third-party players (YouTube, Twitch, Kick, Spotify, SoundCloud, ...) play only when the visitor starts them, under the provider's own controls. Twitch and Kick start muted.

**The policy, reversible and central.** The Truth contract `silent-ui-policy`, plus `tests/silent-ui-policy.test.js` (3 tests). The tests fail if any UI sound source or sound file ships, or if a new place creates a `<video>` without review. Changing the policy later means changing that test and the contract.

**Not covered** (outside GamID's control): browser and operating-system sounds, and audio inside third-party embeds once the visitor starts them.

### Validation and E2E

Full suite: 2135 tests, 0 failures (2 pre-existing skips). Lint, typecheck and Truth validation are clean.

The server-side behaviour is unchanged since the §10 E2E on GM-TEST-01: draft / published consistency, storage, Usage and orphan cleanup.

**Not verified live (needs Mazen, signed in):** the new confirmation in the live editor, and the silence of the live editor. The acceptance checklist in §10 now starts with: Delete an unused image → the simple confirmation appears; Cancel keeps it; Delete removes it.