# Friends Stickers V1 (DEC-0011)

Mazen's task "GAMID — FRIENDS STICKERS V1" and its addendum "Sender Avatar + Optional Gaming Clip Link" (2026-10-24), TESTING only. Builds on Wall Stages V2 (accepted 2026-10-23, `docs/WALL-STAGES-V2.md`), which it preserves.

**Status: PENDING Mazen's manual acceptance.** Truth: `friends-stickers` PENDING_ACCEPTANCE. Deployment: §9.

## 1. What it does

- **Sending.** A signed-in player whose GamID is public sends one of 14 free animated stickers to a Friends Stage on another player's published Wall. The sender chooses the stage and the position, and can attach one gaming clip link.
  - Entry points: the Wall editor (Templates & Stickers → Stickers → choose → Send sticker → find a player → their Friends Stage → position → Send), and the other player's Wall (Add sticker on a Friends Stage → choose → position → Send).
  - Both use the same flow (`dist/wall-kit/sticker-composer.js`) and the same server function (`send_wall_sticker`).
- **Owner approval.** Every sticker waits for the Wall owner. Pending and rejected stickers (and their links) are never public.
  - The owner sees the sticker, the sender's avatar and @username, the stage and the clip link before deciding.
  - Approving or rejecting covers the whole submission.
  - The owner can later remove an approved sticker (asked once, DEC-0008) or drag it on its Friends Stage.
  - The pending count shows on the Templates & Stickers tool and in the Friends Stage panel. New requests arrive live.
- **Display.** An approved sticker always shows with:
  - the sender's current GamID avatar (or initial) and @username, visibly beside it, moving and scaling with it as one group;
  - a small clip button only when a link is attached. It opens the clip in a new tab: nothing is embedded or played.
- **Dynamic size.** Each newly approved sticker starts at 100%. Every newer active approved sticker on the same Wall takes 5 percentage points off an older one, down to 50%: `size = max(50, 100 − 5 × newer)`. It is linear, never stored and recalculated on every removal.
- **The official Friends Stage background.** Every Friends Stage shows the supplied portrait background. It is not the owner's, cannot be changed, and there is no catalog in V1.

## 2. Decisions taken in this task

| Decision | Choice | Why |
|---|---|---|
| Background | The supplied 9:16 portrait image (941×1672) on desktop and mobile, as delivered | Mazen supplied it after Checkpoint A showed that the landscape image could not fill the portrait stage. Every Wall stage is a 9:16 canvas on every device. The image's ratio differs from the stage's by 0.07%, so it fills it with no visible cropping or stretching. |
| Who may send | Any signed-in player whose GamID is public, never to themselves | Visitors see the sender's avatar and name, so they must be public. The owner approves everything. Proposed at Checkpoint A. Mazen asked to continue without choosing, so the recommended default stands for his review. |
| Sticker files | 384 px animated WebP built from the originals: all 72 frames, 24 fps, infinite loop, transparency. Stills from the static masters. | The originals are 4–13 MB each (130 MB in total). The served copies total about 33 MB (1.2–3.1 MB each), visually equivalent at display size. The originals are unchanged and recorded by SHA-256 (`scripts/friends-stickers/assets-manifest.json`). |
| Clip providers | YouTube, Twitch, Medal.tv | Discord's media links expire after about a day, so a saved link would break ("where technically supported"). |
| Anti-spam (technical) | At most 5 waiting requests from one sender to one Wall; at most 20 sends per sender per hour | Technical limits, not product limits. Mazen can change them. |
| A sender whose GamID is no longer public | Their sticker is not shown publicly (it still counts in the Wall's size order) | The public page never names a player who is not public. |
| Empty-stage message | Still shown until an approved sticker shows. Its "coming soon" badge is no longer painted. | Stickers exist now, so the badge would be untrue. The eyebrow, title and line are unchanged. |

## 3. Data and server rules

Migration `supabase/migrations/20261024100000_friends_stickers_v1.sql`. It is additive: no existing row or stored document changes.

- **Table** `public.wall_sticker_placements`: one row per sent sticker.
  - Columns: recipient, sender (GamID entity ids), Friends Stage id, sticker key (14 allowed), position (stage units, the sticker's centre: x 150–850, y 150–1580), optional clip link and provider, status (pending / approved / rejected / removed), the Wall's approval number, timestamps.
  - RLS is on with no policy, and every table privilege is revoked: it is reached only through the functions below.
  - The sender is always the authenticated account's own GamID. No avatar or name is stored; both are read at display time (the current avatar).
- **Sender functions:** `get_my_sticker_sender`, `search_sticker_recipients`, `send_wall_sticker` and `get_my_sent_stickers`.
  - `search_sticker_recipients` returns public GamIDs with an enabled published Wall that has a Friends Stage, never the caller.
  - `send_wall_sticker` checks every rule: a public sender, a public recipient with an enabled published Wall, a Friends Stage of the published Wall, a catalog sticker, the position, the clip rule and the anti-spam limits. One send at a time per sender.
- **Owner functions:** `get_my_wall_stickers`, `review_wall_sticker`, `remove_wall_sticker` and `move_wall_sticker`.
  - Approving needs the Friends Stage on the owner's draft. Decisions on one Wall are serialized, so approval numbers are stable under concurrency (with a unique index as a safety net).
  - A move to a new place notifies the sender once; a move to the same place does nothing.
- **Visitors:** `get_public_wall_stickers(handle)`. It returns approved stickers on the published Friends Stages of a public, enabled Wall, from senders whose GamID is public, with the size computed over the Wall's active stickers.
- **Clip rule:** `private.wall_sticker_clip`, the exact SQL port of `dist/wall-kit/embed/providers/clip-links.js`.
  - The stored link is rebuilt from its accepted parts: https only, the provider's own host, no query, fragment, credentials or port.
- **DEC-0011 E:** `save_my_wall_draft_impl` now refuses (`STAGE_HAS_STICKERS`) a draft that deletes, or turns into a My Stage, a Friends Stage holding active stickers.
  - The editor refuses the same, using the owner's real counts (`setActiveStickerCounts`), and so does a whole-Wall template.
  - Every other line is the live definition, verified identical before the migration.
- **Notifications** through the existing `private.notify`:
  - `sticker.request_received` → the owner (opens the editor's requests);
  - `sticker.approved`, `sticker.rejected` and `sticker.moved` → the sender (opens their sent list).

## 4. Files

| Area | Files |
|---|---|
| Shared rules | `dist/wall/stickers.js` (catalog, area, size), `dist/wall/stage-types.js` (real active counts), `dist/wall-kit/embed/providers/clip-links.js` (clip rule; provider facts live with the adapters, DEC-0002) |
| Painting | `dist/wall-kit/sticker-paint.js`, `dist/wall-kit/paint.js` (official background + sticker layer on Friends Stages), `dist/wall-kit/friends-stage.js`, `dist/wall-kit/wall-kit.css` |
| Send flow | `dist/wall-kit/sticker-composer.js`, `dist/wall-kit/stickers.css` |
| Editor | `dist/wall-editor/index.html` (Templates & Stickers, Friends Stage panel), `dist/wall-editor/stickers-owner.js`, `dist/wall-editor/editor.js`, `editor.css`, `editor-desktop.css`, `mobile-shell.js` |
| Visitor page | `dist/public/public-wall.js` |
| Client / notifications | `dist/account/supabase-client.js`, `dist/notifications/notification-types.js`, `dist/notifications/notification-center.js` (a data-free `gamid:notifications-received` event with the new rows' type keys) |
| Assets | `dist/wall-kit/stickers/<key>.webp` + `<key>-still.webp` (14 × 2), `dist/wall-kit/friends/friends-stage-bg.webp` (the supplied file, byte-identical), `scripts/friends-stickers/build-assets.mjs` + `assets-manifest.json` |
| Database | `supabase/migrations/20261024100000_friends_stickers_v1.sql` |
| Tests | `tests/friends-stickers-db.test.js` (PGlite), `tests/friends-stickers.test.js`, guards updated for the deliberate changes |

## 5. Responsive behaviour

- **One position for every screen.** Placements are stored in stage units of the canonical 1000×1778 canvas, so they land in the same place on desktop, tablet and phone (portrait and landscape), in the editor and on the visitor page.
- **One size rule.** The size is a percentage of one base box (300 units).
- **Readable attribution.** The avatar and name scale with the sticker but never below 20 px / 10 px.
- **Phones.** The send flow is full screen; on tablets and desktops it is a centred dialog.
- **Touch.** Drags use pointer events (mouse and touch, one finger); the browser tests use real touch events.

## 6. Performance

- **Reads.** The visitor page reads the stickers once, and each sender's avatar once.
- **Lazy loading.** Sticker images load lazily (`loading="lazy"`), and the send flow's code loads only when Add sticker is opened. The picker shows the small stills (about 50 KB each); the animation plays only for the chosen sticker.
- **Caching.** The served files are static and cached by the browser with ETag revalidation (the accepted static-asset behaviour).
- **Reduced motion.** It shows the stills.
- **No reloads.** No action reloads the Wall: the owner's actions re-read only the sticker list, and a send changes nothing on the visitor's page.
- **Media untouched.** Nothing changes in the existing Wall video and image optimizations (F1–F8).

## 7. Validation (local; lab and fixture harness; rolled-back rehearsal on TESTING; no real device)

- **Unit and database:** `npm test`, 2,192 tests, 0 failures.
  - New: `friends-stickers-db.test.js` (9, PGlite) and `friends-stickers.test.js` (11).
  - The database tests cover:
    - the clip rule (a 42-link corpus run through both the browser and SQL rules, identical answers);
    - sending (anonymous, private, self, wrong stage, unknown sticker, out-of-area, bad / unsupported link);
    - the anti-spam limits;
    - owner-only review (pending never public);
    - dynamic size (5 approvals → 80/85/90/95/100; removing the oldest, a middle one and the newest; the 50% floor; unique approval numbers);
    - moves (owner only, inside the area, one notification per saved move);
    - the visitor read (published Friends Stages only, public senders only, disabled or private Walls);
    - no direct table access;
    - search;
    - `STAGE_HAS_STICKERS` on the draft save.
- **Editor, browser (lab, synthetic players): 54/54.**
  - Desktop 1440×900:
    - review (sender, stage, clip before deciding), approve and reject, and sizes after approval (100/95/90);
    - mouse drag saved once on release, clamped to the area, never selecting a Wall element;
    - remove (asked first, sizes recover);
    - conversion and deletion refused while stickers remain;
    - Preview (clip as a link) and reload persistence;
    - a changed sender avatar shown at once.
  - Templates & Stickers: two sections, the 14-sticker catalog, and the send flow (search, stage choice, drag and arrow keys, clip validation, the server's refusals in words, the sent list, a private GamID refused, Escape).
  - The notification link (`#stickerRequests`) and reduced motion (stills).
  - Tablets 768×1024 and 1024×768: no overflow.
  - Phone 390×844 and 844×390 with real touch: one-finger drag saved once, the Friends panel sheet, approve by tap, the full-screen send flow, and send with a touch-positioned sticker.
- **Visitor page, browser (accepted fixture harness, synthetic data): 34/34.**
  - The official background on Friends Stages, never the owner's red Wall background.
  - Approved stickers with avatar or initial and @username always visible, sizes as the server says, and the clip as a new-tab link only where attached; clicking it opens the clip.
  - The empty message only on a stage without stickers.
  - Anonymous visitors: no Add sticker and no sender check.
  - An eligible signed-in visitor gets Add sticker (44 px) on each Friends Stage and sends with their token (handle, stage, sticker, position, rebuilt clip; never an avatar or a name); the page is not reloaded.
  - No Add sticker for the owner or a private GamID.
  - Phones (portrait / landscape) and a tablet: the same stage-relative positions as desktop; the full-screen send flow on phones.
  - Reduced motion: stills.
- **Non-regression:**
  - Wall Stages V2 60/60, Friends Stage backgrounds 12/12, owner empty state 36/36, visitor empty state 70/70, the mobile editor functions;
  - Mobile Public Wall Visitor V2 196/196;
  - the live Wall Stages smoke.
  - The four existing browser scripts were updated only for this task's deliberate changes: the official background layer, the badge, and the Friends panel content.
- **Database rehearsal on TESTING:** the whole migration plus checks inside a transaction that was rolled back.
  - Objects, RLS, grants and the four notification types are as intended.
  - The save keeps `WALL_STAGE_LIMIT` and gains `STAGE_HAS_STICKERS`; the clip rule answers as in the browser.
  - All 5 stored drafts stay saveable.
  - After the rollback, nothing remained and the save function's hash was unchanged.
- **Not tested:** a signed-in real account (the agent does not sign in as personas), physical Android / iOS devices, Safari and Firefox.

## 8. Not built (V1 scope)

- Premium, Pro or Boost; paid stickers or backgrounds; any purchase or subscription.
- Writing Stickers (sticky note, graffiti note); a background catalog.
- Embedding or playing clips; Discord clip links (Discord message links were added by the follow-up, §10).
- Sticker expiry; per-friend allowances.

## 9. TESTING delivery (2026-10-24)

- **Product:** `524939cfda495abb3f90534b53914ffc634038b2` on `feature/mobile-public-wall-visitor-v2` (not merged).
- **Database:** migration `20261024100000_friends_stickers_v1` applied to TESTING in one transaction and recorded in the migration history (`migration repair --status applied`).
  - Verified live: table present, 0 rows, the four notification types, the save check, and visitors can call only the public read.
- **Site:** run `40079878018`, successful.
  - The stamp reads `524939c`.
  - All 25 checked files are byte-identical to the commit: every changed code file, the background and sticker samples.
- **Live smoke** (anonymous, read-only): 9/9.
  - `/@black` shows its Wall on desktop and phone; its Friends Stages show the official background; the sticker read is anonymous and happens only where a Friends Stage exists.
  - No Add sticker or sender check for anonymous visitors.
  - The editor loads to its sign-in gate; the files are served as WebP.
- **Rollback:** redeploy `93f24ad` (the previous site).
  - The migration is additive: the table can stay empty.
  - To fully undo it, drop the sticker functions, revert `save_my_wall_draft_impl` to its 20261022120000 definition, delete the four notification types and drop the table.

## 10. Follow-up corrections (2026-10-24, PENDING Mazen's acceptance)

Mazen's task "GAMID — FRIENDS STICKERS V1 / Follow-up Corrections" (TESTING only). He chose both recommended options for the two privacy conflicts reported before any protection changed:
- **Show avatar + name.** A private sender's approved sticker keeps their avatar and @username. The accepted `visitor-media-access` rule ("reads end when a GamID goes PRIVATE") is narrowed for the avatar only; Truth carries the amendment.
- **Private notice page.** A PRIVATE GamID's `/@handle` shows who it is and that it is private, nothing else.

The code comments and the migration version say 2026-10-25; the work and the decisions are from 2026-10-24.

### 10.1 Private senders
- `get_public_wall_stickers` no longer drops stickers whose sender is not PUBLIC. It still needs the sender's SOLO entity and handle; a deleted account's placements are removed with it (cascade).
- Storage: a second policy, `private identity avatars are readable` (`private.avatar_is_private_identity`), lets anyone read the **current** avatar of a SOLO **PRIVATE** GamID. The accepted public-avatar policy is unchanged. DRAFT (unpublished) avatars and every other object (Wall pictures, Intro, earlier avatars) stay as before.
- The avatar and @username beside a sticker are one link to the sender's GamID:
  - on the public Wall, the same tab, with `?from=<wall owner>` so Back returns to the Wall;
  - in the editor's Preview, a new tab;
  - never on the owner's drag canvas (dragging is unchanged).
- **Private notice:** `public.get_private_identity_notice(handle)` (anonymous) returns handle, display name and avatar reference for a SOLO PRIVATE GamID only. `/@handle` then shows the avatar, display name, @username and "This account is private." No bio, Wall, games, sections, Intro or stats; none of those reads is made.
  - Unknown and unpublished handles keep the identical not-found page.
  - The Worker's crawler preview is unchanged.
- GamID has no suspension or blocking concept yet; deletion and the owner's moderation (approve, reject, remove) are unchanged.

### 10.2 Quota (replaces 5 waiting per Wall and 20 per hour)
- **5 counted submissions per sender in any rolling 24 hours, across all recipients.** One server function decides the number (`private.wall_sticker_quota_limit`); the future Pro limit (10) is not approved or built.
- **Ledger** `public.wall_sticker_quota`: one row per send (RLS on, no client access). It has no foreign key to the placement, so a sticker the owner removes or that is deleted still counts until 24 hours after it was sent. An owner's rejection sets `released_at`, freeing the slot at once.
- **Counted:** pending, approved, approved-then-removed, approved-then-deleted. **Not counted:** rejected.
- **Concurrency:** `send_wall_sticker` takes the per-sender transaction lock (`pg_advisory_xact_lock('wall-sticker-sender:'…)`) before it reads the count and inserts the placement and its ledger row, so parallel sends are serialized and can never pass 5.
- At the limit the send fails with `STICKER_DAILY_LIMIT` (detail: when the oldest counted send turns 24 hours old). `get_my_sticker_quota()` returns `(quota_limit, used, next_available_at)`.
- **Send flow:** it reads the quota on opening; the place step shows "You can send N more of your 5 free stickers in the next 24 hours."; when none are left, "You've used all 5 of your free stickers for now. You can send another today at HH:MM" (or "<Weekday> at HH:MM"), in local time. A refused send re-reads the quota.
- The existing TESTING placement was backfilled into the ledger.

### 10.3 Discord message links
- **Accepted:** server message permalinks `https://discord.com/channels/<guild>/<channel>/<message>` (17–20-digit ids, optional trailing slash). The hosts `www.`, `ptb.` and `canary.discord.com` and `(www.)discordapp.com` are accepted and rebuilt to `https://discord.com/channels/G/C/M`; query and fragment are dropped.
- **Refused:** direct-message links (`/channels/@me/…`), other Discord paths, and Discord file links (`cdn.discordapp.com`, `media.discordapp.net`). File links are signed and expire, so they get their own message: "Discord file links expire. Paste the message link instead (on the message: Copy Message Link)."
- It is only a link, opened in a new tab: no Discord API, no download, no embed or autoplay. It opens only for people who can see the channel, and the send flow says so.
- The browser rule (`clip-links.js`) and the server rule (`private.wall_sticker_clip`) are kept identical by the shared corpus test. The `clip_provider` check now allows `discord`. YouTube, Twitch and Medal.tv are unchanged.

### 10.4 Also fixed
- On short landscape phones (844×390) the send flow's stage preview could shrink to 0 px after the quota line was added. The body's children no longer shrink; the body scrolls.

### 10.5 Files
- Migration `supabase/migrations/20261025100000_friends_stickers_corrections.sql`.
- `dist/wall-kit/embed/providers/clip-links.js`, `sticker-composer.js`, `sticker-paint.js`, `paint.js`, `wall-kit.css`, `stickers.css`.
- `dist/public/public.js`, `index.html`, `public.css`, `public-wall.js`; `dist/wall-editor/editor.js`; `dist/account/supabase-client.js`.
- Tests: `tests/friends-stickers-db.test.js`, `tests/friends-stickers.test.js`, `tests/public-my-games.test.js`, `tests/wall-public-publishing.test.js`.

### 10.6 Validation
- `npm test`: 2,198 tests, 0 failures.
- Database (PGlite, both migrations): the five-recipients case with the sixth refused; a rejection releases the slot; approved, removed and deleted still count; the rolling expiry; the lock comes before the count; ten sends in a row give exactly five; private notice and avatar rules; Discord in the shared corpus.
- Browser (lab and fixture harness): editor 59/59 (desktop, tablet, phone touch, landscape), visitor 46/46 (private sender kept, profile link with `from=`, Discord clip, the private notice at 1440 and 390 px with no Wall, games or sections reads, unknown handle → not-found).
- Non-regression: Wall Stages 60, backgrounds 12, owner empty state 36, visitor empty state 70, the mobile editor functions, Mobile Public Wall Visitor V2 196/196.
- True parallel sessions cannot run in PGlite; concurrency is covered by the lock order. No real signed-in account, physical device, Safari or Firefox was tested.

### 10.7 TESTING delivery
- **Product:** `6a7b89a9a62a23948f6c121ca11734fb36fe1796` (not merged).
- **Database:** `20261025100000_friends_stickers_corrections` rehearsed in a rolled-back transaction (ledger backfill 1 row, policies, grants, the Discord rule), then applied and recorded in the history (`migration repair --status applied`).
- **Site:** run `40098732831`, successful; stamp `6a7b89a`; the changed files are byte-identical to the commit (`public/index.html` differs only by the version stamps).
- **Live smoke** (anonymous, read-only): stickers 9/9, Wall Stages smoke passes.
- **Rollback:** redeploy `524939c` (run `40079878018`). The migration is additive; to fully undo it, restore the three replaced functions and the clip rule from `20261024100000`, drop the notice function, the private-avatar policy and the ledger.

## 11. Clip button position (2026-10-25, PENDING Mazen's check)

- On published Friends Stages the clip (play) button sat slightly too far from its sticker: at `top: 3%; right: 3%` of the square sticker box, while the artwork is drawn `object-fit: contain` inside it.
- It now sits at `max(3%, 25% − button size)` from the top and right: its inner edge is 25% into the box. While the button scales with the sticker (17% of the box, boxes ≥ ~153 px, typically desktop) that is 8% from the corner; at its 26 px minimum (phones, small stickers) it stays at 3%, where it already touches the artwork.
- Unchanged: the button's design and behaviour, the clip links (YouTube, Twitch, Medal.tv, Discord), the sender's avatar and @username (pinned by a test), saved positions and the dynamic sizing.
- Product `1aba378`, run `40182003937`; `PROJECT_HANDOFF.md` §126.
