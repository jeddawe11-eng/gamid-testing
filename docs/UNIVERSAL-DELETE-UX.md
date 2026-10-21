# Universal Delete UX & Reference Cleanup (2026-10-21)

Mazen's task: "GAMID — UNIVERSAL DELETE UX & REFERENCE CLEANUP, ONE COMPLETE IMPLEMENTATION TASK" (TESTING only).

Branch `feature/universal-delete-ux`, based on `feature/f8b1-video-renditions` at `1f7d203`.

**Status: implemented and tested on the branch. NOT deployed.** The migration is not applied, and TESTING still serves `764e3b8`. Awaiting Mazen's review.

## 1. The contract

| The resource is… | What happens |
|---|---|
| **NOT IN USE** | It is deleted at once, with no question. |
| **IN USE** | One confirmation appears, showing: the name, where it is used, what deleting it does, and **Delete** / **Cancel**. Cancel has the focus. |
| **CONFIRM** | It is deleted, and every reference to it is removed. |
| **CANCEL** | Nothing changes. |

"In use" is decided from three sources:
- the Wall being edited, unsaved edits included;
- the **saved draft**;
- the **published Wall**.

The last two are authoritative and persisted, and the server checks them in the same transaction that deletes.

So:
- an asset placed only in unsaved edits is never deleted without asking;
- an asset removed in the editor but still present in the saved or published Wall is asked about too.

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

## 5. Exceptions for Mazen's decision

1. **Stage delete.** It always confirms, under the accepted contract `stages-bar-global`. Under the universal rule, an empty stage would be deleted at once. It is left unchanged, because changing an accepted contract is Mazen's call.
2. **A file that could not be removed after the row was deleted.** This is an existing gap.
   - Fonts have an owner cleanup (`usage_font_orphans`). Wall images and videos have none, so such a file keeps counting toward the 200 MB.
   - The client now retries 3 times and says so honestly if it still fails.
   - A Wall-asset orphan cleanup (files older than 1 h with no asset row, deleted by the gateway's existing owner cleanup) is designed but **not built**: it would be a new automatic storage-deletion path, and it needs Mazen's approval.
3. **The published Wall changes immediately** when an in-use resource is deleted on confirmation. Visitors stop seeing it without a re-publish. This follows the contract ("resolve all references", no dangling references), and the dialog states it.
4. **The old refusing RPCs** `delete_my_wall_asset` and `delete_my_wall_font` remain on the server for pages cached before the deploy. Their removal can be a later clean-up.

## 6. Validation (the 12 required items)

| # | Item | Evidence |
|---|---|---|
| 1 | Unused asset is deleted at once | DB "1 / 6"; UX "1 unused asset" |
| 2 | Used background: warning, then confirm | DB "2 / 3 / 4"; UX "2 / 3 / 4" (the Whole Wall video and stage backgrounds) |
| 3 | Used stage image or video | Same, including a `media: "video"` layer |
| 4 | Multi-reference asset | 4 placements across 2 stages, plus the publication |
| 5 | Used font: warning, then fallback | DB "5"; UX "5" (the fallback is named; the payload is otherwise identical) |
| 6 | Unused font is deleted at once | DB "1 / 6"; UX "5 / 6" |
| 7 | Cancel | UX "7 cancel"; dialog Escape and Cancel |
| 8 | Failure leaves no inconsistent state | DB "8": conflict, invalid result and unknown place all roll back. UX "8": conflict, offline, lost answer after commit, saving, conflict state. |
| 9 | Permissions | DB "9" and "shape" |
| 10 | Storage cleanup and Usage | UX client test (bucket, retries, 404, pending); renditions detach; usage triggers unchanged |
| 11 | Desktop and mobile layouts | Dialog lab at 3 sizes (screenshots reviewed); the shared panels |
| 12 | Editor and visitor non-regression | Full suite. The visitor page only ever reads a valid published snapshot (proven by DB "2 / 3 / 4"). |

Full suite: 2121 tests, 0 failures (2 pre-existing skips). `npm run lint` and `npm run typecheck` are clean.

**Not done:** a signed-in end-to-end run on TESTING. It needs the deployment, and a GM-TEST-01 run by Mazen.

## 7. Deployment (needs Mazen's separate authorization)

1. Apply `20261022100000_universal_delete_resolve.sql` on TESTING. It is additive and replaces no live function.
2. Deploy the site from `feature/universal-delete-ux`.

No Edge Function changes. No infrastructure changes.

## 8. Prepared GamID Truth update (to apply at deployment, not before)

Today, `custom-font-delete` correctly describes the refusing behaviour that TESTING still runs.

At deployment, replace it with: "Deleting a font follows the universal deletion rule. An unused font is deleted at once. A font in use (in the Wall being edited, the saved Wall or a published Wall) asks for one confirmation, warning that the text's appearance changes. On Delete, the font is deleted and every reference is removed from the draft and the published Wall in one transaction; each text keeps its content, position and styling and falls back to its library font. A registered font file cannot be deleted directly."

Add the matching asset contract to the Wall assets capability: "Deleting an uploaded Wall image or video follows the universal deletion rule. On confirm, it is removed from every background and element in the draft and the published Wall in one transaction, then deleted; nothing else changes."

Both contracts are PENDING_ACCEPTANCE until Mazen accepts.
