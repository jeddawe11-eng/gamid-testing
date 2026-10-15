# My Crew owner navigation and public directory (TESTING)

Current polish product `fcbf081b0b7446427d0d2c1462ae24dea4b97c14` (prior navigation product `7ab1278f94c36c265df1d47b4388ab1db418c3dd`), authorized branch `feature/play-together-notifications`, resumed from verified GitHub/local `1485d43f4dc11fc5d7abfe14374495313ddb5254` and existing TESTING `ff5fff9`. **New UX PENDING Mazen visual acceptance.** Existing accepted Crew membership, ownership, invitations, rename, Wall, Editor and Public Profile contracts remain accepted; this follow-up does not claim their acceptance covers the new navigation.

## Owner flow

Desktop collapsed My Crew keeps its first three existing artwork cards in one equal-width Desktop row (one or two Crews use the available width equally), member counts and public-avatar images. At four or more Crews, the remaining count uses a centered `+N more crews` button spanning the summary width; keyboard activation opens the existing My Crew section. There is no arrow tile or horizontal overflow.

The expanded section now starts with a compact vertical list: Crew name, game, member count, available canonical icon/initial fallback and subtle open indicator. Selecting an entry opens that Crew's original management region, with Back to All Crews returning focus to its list entry. Only one management region is visible; the list is hidden while managing or creating. All original Crew cards remain mounted (hidden when inactive), each with exactly one copy of its actual fields/actions; no duplicate management forms or alternate backend flow is introduced. Existing selected-Crew, rename, invite, confirmation, Wall editing and creation state stay owned by the original controller. Unrelated profile fields and Avatar/Intro state are never reconstructed by this navigation.

`+ Add Crew` replaces the oversized closed creation card. It opens the original catalog-search/pick/name workflow in its own region. Back to All Crews preserves the creation draft; its original Cancel still explicitly clears that creation draft. Existing server validation/errors, one ACTIVE Crew per game, membership limits and immediate creation behavior remain.

Owner/non-owner visibility of Rename, Remove, Invite, Wall Edit/Publish, Delete or Leave is unchanged. Original confirmations and server-authoritative actions are reused. Busy actions keep navigation disabled through the existing button helper. Real-time removal/deletion of a selected Crew returns to the list when that Crew is no longer present. Original public-avatar reads/fallbacks and artwork allowlists remain; the list icon reuses already-authorized artwork on Desktop, with initials when unavailable. No new image service or provider reads.

`crew-editor.css` contains only the new owner list styles and is loaded beside the unchanged `account.css`. This preserves existing Steam/Duo stylesheet boundaries and unrelated mobile presentation. The Crew navigation itself is available across Desktop, tablet and phone; it is within this task's explicitly authorized Crew scope. The outer Desktop editor remains single-open with full-width details below paired rows.

## Final management polish (2026-10-16)

At 1024px+, a single selected owner Crew has two equal, independently growing columns: Members, pending invitations and existing invite search/results on the left; the original Crew Wall preview, edit, stage controls and publication on the right. Header/rename/count and prominent Back to All Crews precede the columns. Delete/Leave controls and their original confirmations remain separate below. Members without owner rights retain their existing visible actions; no empty Wall column is created for them. No form or action is duplicated.

The Members region uses container-based sizing: one column below 300px available width, two at 300px+, three at 540px+, never exceeding three. Avatars stay 36px; names/handles wrap and authorized actions remain inside each tile. Up to 15 members fit without horizontal overflow or fixed heights. Remove confirmations span the member grid. On screens below 1024px, the management groups stack in original reading order; only the authorized Crew region changes. Unrelated mobile/account.css stays untouched. Existing canonical artwork/public-avatar sources and fallback rules remain.

Back and reopening keep the controller-owned rename and invite drafts, creation query and unrelated Bio/Avatar/Intro drafts without any automatic writes. The same existing Save, immediate Crew actions, server limits and permissions apply.

## Public flow

The existing public server ordering, membership/Wall-publication criteria, `normalizeCrewDirectory`, artwork and up-to-five public-member faces are unchanged. `createCrewsDirectory` initially paints at most nine cards. At ten it provides **View remaining Crew**, which appends the existing tenth card, runs the existing artwork callback and moves focus to that new link. It does not refetch, reorder, discard, merge or hide an inaccessible tenth membership. Reopening the directory starts with the nine-plus-action view again. Original loading/failure fallback remains.

Desktop rows have at most three cards, each at most 19rem wide and with original 16:9 proportions; flex wrapping centers incomplete rows without stretching. Nine yields 3+3+3. Existing tablet (two columns below 960px) and phone (one column below 640px) behavior remains. Original dialog Escape/Tab handling and return-to-opener behavior are retained. The public My Crews entry remains Desktop-only; responsive dialog tests open that existing entry on Desktop and then resize, rather than inventing a mobile entry point.

## Validation

- Completed full build: 1911 tests, 1910 PASS, one existing opt-in SKIP, zero failures; syntax/type checks PASS.
- 45 focused Crew/rename/Wall/roles-favorites-Crews tests PASS. Existing action/permission/confirmation/error tests retained; new owner list selection/Back/Add tests and public nine-plus-one rendering tests added. Test DOMs now support standard `prepend`; no production workaround for test doubles.
- Completed 35 browser cases: counts 0, 1, 2, 3, 5, 9, 10 across widths 390, 768, 1024, 1440, 1920. Single visible management, roles/permissions, Back focus, creation query preservation, unrelated Bio draft preservation, no writes from navigation, public rows and keyboard reveal of the tenth PASS.
- After stylesheet extraction, six focused final-CSS cases at 390/768/1440 with 5/10 Crews PASS; original full matrix is retained rather than unnecessarily repeated.
- Real browser actions at 1440 with five Crews: rename, add Wall stage, publish/unpublish, invite/search, cancel Remove/Delete confirmations PASS. Existing unit tests cover final destructive operations, creation validation, membership permissions and failures with fake APIs; no real account is modified.
- Revealed tenth Crew actual navigation at 1440 reaches its existing Crew Wall route. Screenshots: collapsed summary with 3/5/9/10, owner list, one management region, public nine-row grid and revealed tenth.
- Existing editor functional suite 1024/1440/390 PASS (independent saves, Save All, partial failure/retry, Banner crop/save, Avatar/Intro drafts and Classic Back). Existing media suite 1024/1440/1920/390 PASS; Classic suite 1440/390 PASS (saved data, Wall states, no Intro/write, unauthorized refusal).

Browser services and writes are intercepted fixture responses, including provider images. Neutral fixture artwork is not Mazen's live account content. No Crew region or public directory horizontal overflow occurred. The previous whole Account 768px overflow (80px, documented in the prior sidebar task) is outside this Crew task; unchanged account.css is retained. No physical-device or other-browser manual acceptance is claimed.

## Governance

Truth adds `crew-ux-navigation` as PENDING_ACCEPTANCE to record the new owner single-Crew/list/Add flow and public nine-plus-reveal contract. Accepted base capability records, checkpoints, limits and statuses remain untouched. Membership maximum remains 10, active owned-Crew members 15, one ACTIVE Crew per game and existing Crew Wall stage limits unchanged. No backend, migration, infrastructure or Production changes; no main merge.

Product Memory PROPOSED only: save this follow-up's rationale (compact selection replaces simultaneous long management; nine-card presentation does not reduce membership/access), implementation and eventual owner review with links to IDEA-0001 / REV-0002. No record or index update without separate save approval. Stop for Mazen visual review after successful TESTING deployment.

TESTING delivery (2026-10-16): source `1a980aa1b758e063c35537206fd20ec42c3c8922`, [workflow 38774238925](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/38774238925) SUCCESS. [TESTING Account](https://gamid-testing-static.gamid.workers.dev/account/). Thirteen served frontend files match the deployed source with the expected asset stamp. Post-deploy isolated browser checks PASS: six Crew cases (5/10 Crews at 390/768/1440, including original management actions and actual tenth-Crew navigation), three editor functional cases (1024/1440/390), and two Classic cases (1440/390). All backend writes intercepted; no real account mutations. Final delivery documentation leaves deployed dist unchanged and requires no redeployment. Product Memory remains unsaved. **STOP for Mazen visual review; crew-ux-navigation remains PENDING_ACCEPTANCE.**

## Final polish validation (2026-10-16)

Product `fcbf081b0b7446427d0d2c1462ae24dea4b97c14`; resumed from verified clean GitHub/local `b5e579275d8e07f24828521a1ec990b9078b0829`. Full build: 1911 tests, 1910 PASS, one existing opt-in SKIP, zero failures; syntax/type checks PASS. Focused Crew/rename/Wall/directory tests 45/45 PASS. Browser matrix 35/35 PASS: 0/1/2/3/4/5/10 Crews at 390/768/1024/1440/1920. Five additional 15-member long-name cases PASS across those widths. Assertions cover independent aligned Desktop columns, stacked mobile, actual member-grid columns, overflow, owner/member actions, retained rename/invite/creation/Bio drafts and no writes from navigation. Existing editor functional suite 1024/1440/390 PASS, including independent saves, Save All, partial failure/retry, Avatar/Intro drafts and Classic Back. Existing original management action tests remain. New summary-row geometry assertions will also run on deployed TESTING. All browser backend traffic/writes are intercepted fixtures; screenshots use neutral provider images, not real accounts.

Truth `crew-ux-navigation` remains PENDING_ACCEPTANCE, with updated selection and management-layout contracts/checkpoint. Existing public nine-plus-one flow, accepted base capabilities and all limits unchanged. Product Memory update is PROPOSED only; separate approval is required. No backend/infrastructure, Production access or main merge.
