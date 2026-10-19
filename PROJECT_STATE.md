# GamID Project State

**Entry point for any new session or agent**: Claude, ChatGPT / Work, or any other.

This file is an index and a continuation pointer. It is **not** an authoritative source. Every fact here points to the source that owns it, and **that source wins** whenever the two disagree.

Last reviewed: 2026-10-19.

## 1. Mandatory entry order

1. **Read this file.**
2. **Read GamID Truth:** [`gamid-truth.json`](gamid-truth.json).
3. **Read the agent rules:** [`AGENTS.md`](AGENTS.md).
4. **Read the specialist source for the task** (section 3).
5. **Read the Product Memory index** [`product-memory/INDEX.md`](product-memory/INDEX.md), then only the relevant records.
6. **Verify the current Git and checkpoint state** yourself. The SHAs below are a snapshot and may be stale.
7. **Perform the task.**
8. **Update the authoritative sources** the task changes, such as Truth (per `AGENTS.md`), docs, or Monitor records.
9. **Propose Product Memory records** at meaningful conclusions, and save them only after Mazen's explicit approval (Review Before Save, `AGENTS.md`).
10. **Update this file** only when the continuation state materially changes.

Conversation memory is helpful context, but it is **not** an authoritative project source.

**Acceptance reconciliation (Mazen, 2026-10-11):** Global Usage Center and Classic Profile Desktop were both fully manually tested and explicitly accepted by Mazen. GamID Truth marks `global-usage` and `classic-profile-desktop` ACCEPTED (commit `1af13bd`). Intro identity with current D3 is also ACCEPTED; D2 remains future work. Older PENDING_ACCEPTANCE/PARTIAL PASS statements below are historical and superseded for these capabilities.

**My Socials acceptance reconciliation (Mazen, 2026-10-11):** The full `my-socials` capability is ACCEPTED in GamID Truth, with public visitor links PASS in REV-0005. The separately tracked icon-branding issue ISS-0013 was later VERIFIED (2026-10-11); older pending-acceptance mentions below are superseded for `my-socials`.

**Profile Banner and About Me acceptance (Mazen, 2026-10-11):** Both `profile-banner` and `about-me` were separately confirmed fully accepted by Mazen on TESTING. Truth marks each ACCEPTED; Product Memory DEC-0005 records both confirmations. Historical PENDING_ACCEPTANCE notes below are superseded for these capabilities.

**Steam & League acceptance (Mazen, 2026-10-16):** Truth steam-my-games is ACCEPTED after his real TESTING library/My Games check. League-prototype is ACCEPTED AS PROTOTYPE ONLY (status ACCEPTED), retaining manual Riot ID, unofficial temporary OP.GG, private/unverified data and no official Riot authentication/verification; no successful real-account manual test is claimed. Existing checkpoints preserved. Source: PROJECT_HANDOFF.md §69 and REV-0001 items 5/6. Earlier pending/key-missing statements for these capabilities are historical and superseded.

**Final remaining-features acceptance (Mazen, 2026-10-16):** Canonical Game Catalog/manual add-edit-remove, current provisional SteamGridDB artwork and current root Landing Page were personally tested and explicitly approved on TESTING. Truth marks all three ACCEPTED with existing implementation checkpoints/contracts preserved. Artwork remains provisional and TESTING-only, with the written-permission/release conditions unchanged. No PENDING_ACCEPTANCE capabilities remain in Truth; unimplemented work, outstanding conditions and release/merge authorization remain separate. See PROJECT_HANDOFF.md §70 and REV-0008.

**Living Fire V3 final acceptance (Mazen, 2026-10-19):** Mazen explicitly accepted the full Living Fire V3 capability (Organic / Cinematic / Mythic), following acceptance of the bounding-box fix (REV-0012). Truth `living-fire-text` is **ACCEPTED**, recorded in Product Memory REV-0013. Existing limits, contracts and product checkpoint unchanged; desktop Wall work continues separately.

**Desktop Media & Links / Icon Group UI acceptance (Mazen, 2026-10-19):** Mazen explicitly accepted the desktop-only card-layout and Properties-accordion refinement delivered at product `0615a4c` (TESTING run `39153509185`), recorded in Product Memory REV-0014. All controls remain, Move to Stage stays first, and phone/tablet are unchanged. Truth `wall-icons` remains ACCEPTED; the broader desktop Wall redesign continues separately.

## 2. Environment and safety

- **TESTING** is the working environment. Truth: `environment: TESTING`, `production: NOT_RELEASED`.
- **Production:** never access it without Mazen's explicit authorization.
- **Protected identities:** @black and @zshot are real accounts. Never use, reset, modify or delete them. Monitor enforces this through `protectedIdentities` in `../gamid-monitor/monitor.config.js`.
- **Test personas:** the Monitor's TESTING personas, GM-TEST-01 …, are dedicated test accounts. Don't reset or delete them either.
- **Accepted behaviour:** never change it silently.
- **Detailed rules:** [`AGENTS.md`](AGENTS.md) (Truth workflow) and [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) (status vocabulary, acceptance, what is not authorized).

## 3. Authoritative sources

| Source | Where | Owns |
|---|---|---|
| **A. GamID Truth** | [`gamid-truth.json`](gamid-truth.json), with the rules in [`AGENTS.md`](AGENTS.md) and its validation `tests/gamid-truth.test.js` | Current accepted product state: capabilities, statuses, limits, approved contracts, and the checkpoint per capability. Never bugs, findings or secrets. |
| **B. GamID product repository** | This repository, `jeddawe11-eng/gamid-testing`: `dist/`, `supabase/migrations/`, `tests/` | Implementation, migrations, tests and Git history. |
| **C. gamid-monitor** | Sibling repository `../gamid-monitor` (`jeddawe11-eng/gamid-monitor`). Its records live in `../gamid-monitor/monitor-data/`, which is **git-ignored, local to this machine**. | Testing and inspection: runs, deterministic GM findings, issue lifecycle, coverage, and AI Observer (AO) records. |
| **D. Specialist docs** | GamID: [`PROJECT_HANDOFF.md`](PROJECT_HANDOFF.md) and [`docs/`](docs/). Monitor: `../gamid-monitor/README.md`, `../gamid-monitor/docs/` (e.g. `ARCHITECTURE.md`, `V3-OBSERVER-P1.md`) and `../gamid-monitor/acceptance/v2/FREEZE.md` | Task-specific design, history and acceptance records. |
| **E. GamID Product Memory** | [`product-memory/INDEX.md`](product-memory/INDEX.md), validated by `scripts/product-memory.mjs` | Reasoning: discussions, decisions, ideas, issues and reviews. Never overrides Truth; saved only through Review Before Save. Never passed to the Monitor or Observer. |

## 4. Current product checkpoint

Snapshot from 2026-10-16; verify with `git status -sb` and `git log -1`.

- **Working tip:** `feature/play-together-notifications`, tracking its origin branch. It is **not merged** into `main`.
  - It descends from `feature/wall-video-asset-preview` (accepted video preview fix `c932781`), which descends from `feature/gamid-truth`.
- **Latest product commit:** `bb50aef267a38cf6cb799e243a435133828bf851` (Shapes V2 library category accordions, §91). Previous: `da7dd1c1813d29ab9dc4068e626216af97e69e23` (desktop Shapes V2, §90; Truth `wall-shapes-v2` PENDING_ACCEPTANCE). Before that: `0615a4cc1a082bdaafc82d7eee18c9594de822e7` (desktop Media & Links cards and Icon Group Properties accordion, §89). Previous: `24e2d78a35cd5e2605014da700ebd568de85e8b7` (Living Fire bounding box fix: the letters follow the painted text's lines, §87; accepted). Before that: `5c0371f3b47b256918aa6cb3c0768c679d584f1f` (Living Fire V3 on Wall text, §86; Truth `living-fire-text` PENDING_ACCEPTANCE; migration `20261019100000` applied). Previous: `5a5a31239ff117e6a3c93209547490043ec206e6` (desktop Text editor: Text panel sections with Text Effects, text Properties accordion, §85; Phase A accepted by Mazen). Before that: `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f` (custom fonts: TTF / OTF upload converted to WOFF2 on the server, §84; Truth `custom-wall-fonts` PENDING_ACCEPTANCE). Before that: `875bd2dfe6e194816500f262d7aedeabc14d0f58` (custom Wall fonts, §83). Before that: `8da87669a346e831d8998a3b00323c96727a77a0` (desktop font category accordions, §82). Before that: `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d` (Text & Fonts Phase 2, §81). Before that: `716b4e74df33b9bd50ee2f802dea2442f69a001a` (Desktop Visual Redesign Phase 1, §80; visually approved per Mazen's Phase 2 task). Before that: `ace098218bef771cd5b34afff2a9681cb4afb4b3` (Mobile Public Visitor V2, §77; Truth `public-profile-mobile-v2` ACCEPTED by Mazen 2026-10-17, §78).
- **Previous product commit:** `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3` (Intro landscape hint 6-second refinement, §75), on top of `c3113d0e887ee12878fdd9ec6e09501728c72749` (mobile Intro landscape hint, implemented at `30653d1`, §74; Truth `intro-landscape-hint` ACCEPTED by Mazen 2026-10-17, §79).
- **Previous product commit:** `15e204dcc8e324de3d32efc1e747b041424f45aa` (Mobile V2 visual parity fixes, `PROJECT_HANDOFF.md` §72), on top of `a0c7c95580e7e3375aa095fdc62de520059236ac` (Mobile V2 Profile Deck below 1024px; `docs/PROFILE-EDITOR-MOBILE-V2.md`, §71). Truth `your-gamid-editor-mobile` is PENDING_ACCEPTANCE.
- **Previous product commit:** `0f386d379e811d14afcc043a11601d7f459bd402` (Approved Crew reference, four-column Desktop member grid and confirmed selection removal, retaining summaries/list/public directory; `docs/MY-CREW-UX.md`, `PROJECT_HANDOFF.md` §67, Truth `crew-ux-navigation`; ACCEPTED by Mazen 2026-10-16 (§68)). Prior accepted base capabilities and limits remain unchanged.
- **Previous editor product:** `41aa90692c164d9675698131f561b285cdc8b736` (saved owner Classic preview; `PROJECT_HANDOFF.md` §57; TESTING deployment `7aa0133`, run `38427825018`; PENDING owner acceptance).
- **Previous product commit:** `4b56646e782eefadcc173b64e8aa59f0fab37cd9` (ISS-0011 Intro storage lifecycle and reservation release; ISS-0012 clear refusal; `PROJECT_HANDOFF.md` §42; deployed as head `72896d6`, run `38145293680`; PENDING manual acceptance). Before it: `a1d2eebd5355f8c2ad9c4d7d398348fa0d167cc7` (ISS-0007 Avatar validation, My Crews panel sizing CP-01, Role Suggestions review inside Gaming Roles GR-01; `PROJECT_HANDOFF.md` §38; migration `20261011220000` applied; `usage-upload` v8; deployed by run `38128281601`). Mazen's manual checks passed: CP-01 (REV-0002), GR-01 (REV-0003) and an Avatar save for ISS-0007 (which stays FIXED until his security acceptance); the capabilities `your-gamid-editor`, `my-crews-view` and `gaming-roles-categories` remain PENDING_ACCEPTANCE in Truth.
  - **ISS-0009 is VERIFIED and Truth `visitor-media-access` is ACCEPTED** (Mazen, 2026-10-11, including the documented residual possibility of unknown historical signed URLs; `PROJECT_HANDOFF.md` §30, §38–§40). The known pre-fix synthetic URL was closed by deleting its object (§39).
  - **Earlier product commits:** `506bfa7` (two-column desktop Classic Profile, Gaming Roles in 8 categories + Suggest a Role with admin review, 4 Favorite Games, Crew header game logo; `PROJECT_HANDOFF.md` §37; Truth `gaming-roles-categories` and updated `classic-profile-desktop`, `favorite-games`, `my-crews-view`; migration `20261011200000` applied; deployed to TESTING by run `38125086921`, CI validation passed; PENDING owner acceptance). Before it: `6ab062e` (Favorite Games, separate My Games / Connections cards, View All artwork; §36). Previous frontend product: `e2bfb5102d578c4167f0114eb7be122d485ab09a` (SteamGridDB artwork for every TESTING account, per-account allowlist removed; written permission still outstanding; `PROJECT_HANDOFF.md` §35) on top of `70f8940` (all public Favorite Genres shown; §34), on top of `0ccf1c7`, the Classic Profile desktop consolidated update (unlimited genres, GeoNames country / city Location, Connected Games, the My Crews view and the 10-Crew limit, the provisional SteamGridDB artwork evaluation - off until its key is set; `PROJECT_HANDOFF.md` §33; Truth `my-crews-view`, `game-artwork-provisional`) on top of the Classic Profile visual review `568b530` (full Member Since date, games counter link, desktop MY CREW card, game-tile fallback, Discord / Instagram marks, About Me checkbox fix; `PROJECT_HANDOFF.md` §32) on top of the Classic Profile redesign `4948f6c` (Banner + About Me editor, desktop Classic Profile at 1280 px and wider; DEC-0005, `PROJECT_HANDOFF.md` §31; Truth `profile-banner`, `about-me`, `classic-profile-desktop`) on top of the visitor media access remediation (ISS-0009, Truth `visitor-media-access`, `PROJECT_HANDOFF.md` §30: visitors cannot sign Storage objects; public-media leases; profile-banner) on top of the Discord Profile Card in My Socials (DEC-0004, §26) on top of Enable / Disable My Wall in the Profile Editor (DEC-0003, §25) on top of one social link engine for the Wall and My Socials with Discord personal profiles (DEC-0002, `PROJECT_HANDOFF.md` §24) on top of the Profile Editor completion (My Socials, Save All Changes, Account Settings in the ⋯ menu; Product Memory DEC-0001, `PROJECT_HANDOFF.md` §23) on top of the unified upload and Add error feedback (`d2c24b9`, ISS-0001..ISS-0005, §22), the Profile Editor independent sections and feedback lifecycle (`8ce1616`), four QA fixes (`58720da`, CSS placement `5e2664e`) and the transient field-validation save notification (`fd9c9a9`), deployed to TESTING; manual acceptance PENDING. Source: `docs/PROFILE-EDITOR-UX.md`, `PROJECT_HANDOFF.md` §20 and §22–§26, Truth `your-gamid-editor`, `my-socials`, `game-id-wall`, `wall-visibility-toggle` and `discord-profile-card`. Later commits on the tip are documentation only; verify Git.
  - Prior Intro worker correction `3f72eb23ef483ca29b9076715ec76ab311dcbcfe` remains deployed with READY verification complete. Mazen reported PASS for its Android duration-boundary manual retest (Product Memory REV-0001, 2026-10-09); `intro-identity` remains PENDING_ACCEPTANCE in Truth until that pass is reconciled (§19). Cloudflare migration remains ACCEPTED; Pages retirement remains complete.
  - F5 product 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59 remains **manually ACCEPTED by Mazen** (2026-10-07); its Intro delivery is unchanged.
  - F2 product 04877c20d213f0105fbdc2871146248194eaf773 remains manually ACCEPTED by Mazen (2026-10-07); its worker/derivative policy is unchanged.
  - F3 `3b9d8b1c27fb0c9b3fa6fd0c2ee682dab7618906` remains **manually ACCEPTED by Mazen**; its viewport gating is preserved (`docs/WALL-VIDEO-VIEWPORT-F3.md`).
  - F4 `2ccb0f8aeec701bd4c0e6006c36d4c628a9ec091` is **accepted as the implementation baseline by Mazen** in the F3 authorization; its URL reuse remains preserved (`docs/WALL-VIDEO-URL-REUSE-F4.md`).
  - The preceding timing fix `7cbabf08cb43ead23f178c78bfce6b4ebaa5461d` remains **ACCEPTED by Mazen**.
  - The preceding My Crew navigation fix `f2ba4a709ed28dfc2cbaca4984ce05937659a6c7` remains **ACCEPTED by Mazen**.
  - **play-together-marvel-rivals is ACCEPTED by Mazen** (2026-10-06); current status in Truth, manual acceptance record in `PROJECT_HANDOFF.md` §10.
  - **authenticated-shell is ACCEPTED by Mazen** (2026-10-06); current status in Truth, manual acceptance record in `PROJECT_HANDOFF.md` §10.
  - The preceding Play Together notifications fix `e97594c52d5d341da40fd578c63404ec3b305475` remains **ACCEPTED by Mazen**.
  - The video asset preview fix `c932781`, also ACCEPTED, is in its ancestry.
  - `main` is `da2e020928f546e6b637f38629fd673b15544c2b`, an ancestor of the tip.
- **TESTING serves `bb50aef267a38cf6cb799e243a435133828bf851`** (successful run `39196387512`, Shapes V2 category accordions, `PROJECT_HANDOFF.md` §91).
- **Previously served `da7dd1c1813d29ab9dc4068e626216af97e69e23`** (run `39194776098`, desktop Shapes V2, §90).
- **Previously served `0615a4cc1a082bdaafc82d7eee18c9594de822e7`** (successful run `39153509185`, desktop Media & Links / Icon Group refinement, `PROJECT_HANDOFF.md` §89).
- **Previously served `24e2d78a35cd5e2605014da700ebd568de85e8b7`** (run `39150052877`, Living Fire bounding box fix, §87; accepted).
- **Previously served `5c0371f3b47b256918aa6cb3c0768c679d584f1f`** (run `39147118537`, Living Fire V3 Phase C, §86; migration `20261019100000` applied).
- **Previously served `5a5a31239ff117e6a3c93209547490043ec206e6`** (run `39131378232`, desktop Text editor Phase A, §85; accepted by Mazen).
- **Previously served `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`** (successful run `39127878054`, TTF / OTF upload, §84; `usage-upload` v12; PENDING_ACCEPTANCE).
- **Previously served `875bd2dfe6e194816500f262d7aedeabc14d0f58`** (run `39125819357`, custom Wall fonts, §83; migration `20261018120000` applied).
- **Previously served `8da87669a346e831d8998a3b00323c96727a77a0`** (successful run `39103420138`, font category accordions, `PROJECT_HANDOFF.md` §82, on top of Text & Fonts Phase 2 §81; awaiting Mazen's review). Backend unchanged.
- **Previously served `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d`** (run `39101612969`, Text & Fonts Phase 2, §81).
- **Previously served `716b4e74df33b9bd50ee2f802dea2442f69a001a`** (successful run `39044158099`, Desktop Visual Redesign Phase 1, §80).
- **Previously served `2889d3b44197751efe16617736b514117d3875da`** (successful run `39025962088`, Mobile Public Visitor V2, product `ace0982`, `PROJECT_HANDOFF.md` §77; ACCEPTED by Mazen 2026-10-17, §78). Backend unchanged.
- **Previously served `be6fa4ba93aa40c006b514eb45b7475112d0c0aa`** (successful run `39021570794`, Intro landscape hint 6-second refinement, product `77cfe4f`, `PROJECT_HANDOFF.md` §75; ACCEPTED by Mazen 2026-10-17, §79). Backend unchanged.
- **Previously served `d10ca52e5d20e6d6745e726945a931ca4ba71af9`** (successful run `39013335904`, mobile Intro landscape hint, product `c3113d0`, `PROJECT_HANDOFF.md` §74; PENDING_ACCEPTANCE). Backend unchanged.
- **Previously served `4786c5914f7dc8c42deb0d0f3da2f4430d4bd9e0`** (successful run `39007625520`, Mobile V2 visual parity fixes, product `15e204d`, `PROJECT_HANDOFF.md` §72; PENDING_ACCEPTANCE). Backend unchanged.
- **Previously served `bceb676c1c64f599c980daa4ddc79be9f5dd0bdf`** (run `39001472361`, Mobile V2 Profile Deck, product `a0c7c95`, §71).
- **Previously served `c81ad33a38b101e7f77f76ce8eb5ca6a03850c36`** (successful run `38855728905`, approved Crew reference design and confirmed member selection removal, `PROJECT_HANDOFF.md` §67; ACCEPTED by Mazen 2026-10-16 (§68)). Prior sidebar/Crew presentation is documented in §64. Backend unchanged; existing game-artwork v6 remains. Previous accepted editing-behavior deployment `1ec1da3`, §61–§62; its acceptance is preserved.
- **Previous editor deployment `7aa0133`** (run `38427825018`, Account saved Classic preview; `PROJECT_HANDOFF.md` §57).
- **Previously served `7fa7117`** (run `38392848965`, PROJECT_HANDOFF.md §55: Edit Crew Name, on top of §49 Wall Icon and Icon Group, §48 Spotify / SoundCloud / Vimeo logos on mobile, §47 My Socials Spotify / SoundCloud / Vimeo, §46 desktop scroll fix, §45 ISS-0013, §44 ISS-0010 and §43 Intro limit 50 MiB).
  - Historical static-site checkpoint: workflow run `38145293680` from ref `feature/play-together-notifications` (its head was exactly `72896d6`); the Account HTML stamp reads `72896d6`. Source: `PROJECT_HANDOFF.md` §42.
  - Edge Functions: usage-upload v9 (§42; Intro lifecycle / reservation release, on top of §38 Avatar validation), public-media v2 (§30, §38) and profile-banner (§30), game-artwork (§33-§37; STEAMGRIDDB_API_KEY set; every TESTING account; Crew route §37).
  - Intro worker: correction checkpoint 3f72eb2 deployed with image-only update, F2 smoke and dedicated READY verification; exact build/image/execution in `docs/INTRO-DURATION-TOLERANCE.md`. Accepted F2 derivative policy remains unchanged.
  - Database: Crew rename migration `20261013100000` applied (rehearsed; §55); Wall icons migration `20261012120000` applied (rehearsed; corpus 606/606; §49); My Socials Spotify / SoundCloud / Vimeo catalog migration `20261012100000` applied (rehearsed; §47); Intro storage lifecycle migration `20261011240000` applied (rehearsed; §42); Avatar validated-attach migration `20261011220000` applied (rehearsed; §38); roles / favorites / Crew artwork migration `20261011200000` applied (rehearsed; §37); Favorite Games migration `20261011180000` applied (§36); artwork environment-wide migration `20261011160000` applied (§35); artwork evaluation allowlist migration `20261011140000` applied (§34); consolidated migration `20261011100000_classic_profile_consolidated` applied (rehearsed; GeoNames catalog loaded; §33); Member Since date migration `20261010180000_member_since_date` applied (rehearsed; §32); About Me migration `20261010160000_profile_about_me` applied (rehearsed; §31); Phase 1B–1D Banner and visitor-media migrations `20261010120000`, `20261010130000`, `20261010140000` and `20261010141000` applied (rehearsed each time; §28–§30); Discord Profile Card migration `20261009190000_discord_profile_card` applied once (rehearsed; existing connection rows unchanged and OFF), recorded in `PROJECT_HANDOFF.md` §26; Wall visibility migration `20261009170000_wall_public_publishing_toggle` applied once (rehearsed; existing published Walls unchanged and enabled), recorded in `PROJECT_HANDOFF.md` §25; Wall Discord-profile migration `20261009150000` and My Socials link-engine migration `20261009151000` applied once each (rehearsed, history repaired; @black's one My Socials row converted losslessly with Mazen's approval), recorded in `PROJECT_HANDOFF.md` §24; My Socials migration `20261009120000_my_socials` applied once (rehearsed in a rolled-back transaction first; history repaired), recorded in `PROJECT_HANDOFF.md` §23; accepted notifications migration remains applied; Intro duration migration also applied once, recorded in `docs/INTRO-DURATION-TOLERANCE.md`.
  - Per-capability checkpoints are in Truth.

## 5. Monitor: current architecture

Verify in `../gamid-monitor` (`git status -sb`; `git rev-parse v2-freeze`).

- **V2: deterministic Monitor, FROZEN.**
  - **Version and tag:** Monitor 0.2.2.2; tag `v2-freeze` (tag object `ee21667`) points to freeze commit `a2b4a7b` (`main`).
  - **What was frozen:** the validated code `37a6360`, with record `acceptance/v2/FREEZE.md`.
  - **Its role:** PRODUCT FAILURE and GM-#### findings come only from V2 and stay deterministic.
- **V3 AI Observer: `observer-p1.2`.**
  - **Location:** branch `feature/v3-observer-gemini`, not merged; verify its HEAD with `git log -1`. The prompt is `prompts/observer-p1.2.md` (sha256 `9350dae9…`); the Observer version is `0.3.0-p1.2`.
  - **Its role:** a non-deterministic second opinion over stored evidence (AI_OBSERVATION, AO-####). Every AO needs human review.
  - **Limits:** it never alters V2 health, issues or lifecycle. Every paid call needs Mazen's authorization.
- **Action coverage pilot** (same branch, `src/v3/actions.js` / `src/v3/pilot.js`):
  - **What it does:** deterministic exploration performs one defined action and captures the resulting state for later blind observation.
  - **First pilot:** Wall Editor → Assets (`open-assets`). The architecture was validated end to end.
  - **Distinction:** ACTION COVERED (the action ran and the state was captured) is **not** the same as VISUAL CONTENT COVERED (the state contained the content worth inspecting, which depends on test data).
  - **Scope:** don't expand it into a crawler unless separately approved.

## 6. Current decisions

- No P1.3 now, and no further Observer polishing now.
- No general crawler, and no local Vision AI project, now.
- P1.2 remains an occasional second-opinion layer.
- Deterministic exploration decides which meaningful states are captured. AI inspects the resulting evidence; it does not control navigation.

## 7. Current continuation point

**Latest continuation (2026-10-19, Shapes V2 category accordions):** the desktop shape library's categories are accordions (Basic open; §91), product `bb50aef267a38cf6cb799e243a435133828bf851` (run `39196387512`); Truth unchanged (`wall-shapes-v2` PENDING_ACCEPTANCE). **Next:** Mazen's visual acceptance; his decision on the Shapes V2 database parity migration is still open.

**Previous continuation (2026-10-19, desktop Shapes V2):** a 38-shape vector library, the Freeform pen and Edit Points, Smart Shapes, Lock aspect ratio and the Shape Properties accordion are on TESTING (§90, `docs/WALL-EDITOR-SHAPES-V2.md`); product `da7dd1c1813d29ab9dc4068e626216af97e69e23` (run `39194776098`); Truth `wall-shapes-v2` PENDING_ACCEPTANCE. No database change; the prepared parity migration (`docs/proposals/wall-shapes-v2-db-parity.sql`) awaits authorisation. **Next:** Mazen's visual and functional acceptance, and his decision on the parity migration.

**Previous continuation (2026-10-19, desktop Media & Links / Icon Group refinement):** the Media & Links cards and the Icon Group Properties (five accordion sections, every control kept; Move to stage stays first) match the desktop editor design (§89); product `0615a4cc1a082bdaafc82d7eee18c9594de822e7` (run `39153509185`); phone and tablet unchanged; Truth unchanged. **Next:** Mazen's visual acceptance.

**Previous continuation (2026-10-19, Living Fire bounding box fix ACCEPTED):** Mazen tested and accepted the bounding-box fix (§88, Product Memory REV-0012): Living Fire letters follow the painted text's own lines and stay inside the selection box (product `24e2d78a35cd5e2605014da700ebd568de85e8b7`, §87). Truth `living-fire-text` is still PENDING_ACCEPTANCE. **Next:** Mazen's final acceptance of the Living Fire capability itself.

**Previous continuation (2026-10-19, Living Fire V3 Phase C):** Living Fire is integrated on TESTING (§86, `docs/WALL-EDITOR-TEXT-EFFECTS.md` Phase C). It has one Text Effects entry with Organic (default), Cinematic and Mythic, controls in the desktop Text Effects section, and works in the editor, Preview, saved and published Walls. The audit passed, with at most 4 live animations. Product `5c0371f3b47b256918aa6cb3c0768c679d584f1f`; additive migration `20261019100000` applied; Truth `living-fire-text` PENDING_ACCEPTANCE. **Next:** Mazen's final acceptance with his own account (add Living Fire, try the three styles, publish, view as a visitor).

**Previous continuation (2026-10-18, desktop Text editor upgrade):** Phase A is on TESTING (§85, `docs/WALL-EDITOR-TEXT-EFFECTS.md`). The desktop Text panel is reordered: Add Text, Font Library, Text Effects, My Fonts, Upload My Font. Text Effects has Neon (the existing glow) and Living Fire as "Coming soon". Text Properties sit in five independent sections. Product `5a5a31239ff117e6a3c93209547490043ec206e6`, no backend change; Truth unchanged. Phase B, the Living Fire V3 readiness report, is in the doc. **Next:** Mazen's acceptance of Phase A, and his choice of V3 variant(s) (Organic / Cinematic / Mythic) plus authorisation of the migration that Phase C needs. Living Fire is not to be integrated before then.

**Previous continuation (2026-10-18, TTF / OTF upload):** Upload My Font now also accepts TTF and OTF (up to 8 MB). They are validated and converted on the server to the stored WOFF2 (at most 2 MB), with the runtime's own Brotli and no new service; there was no migration (§84). Product `e73c79d4ecf9a3e3ad32ece64b84e53d5e54404f`, `usage-upload` v12; Truth `custom-wall-fonts` PENDING_ACCEPTANCE. **Next:** Mazen's acceptance test with his own account (WOFF2, TTF such as Imperial Script, and OTF uploads; apply, publish, visitor view, delete).

**Previous continuation (2026-10-18, custom Wall fonts):** Mazen approved and the agent implemented Upload My Font / My Fonts on TESTING (§83, `docs/WALL-EDITOR-TEXT-FONTS.md`). The rules are WOFF2, 2 MiB, **at most 3 per account**, inside the 200 MB quota, owner-only, readable by visitors only through a published PUBLIC Wall, with deletion refused while a Wall uses the font. Product `875bd2dfe6e194816500f262d7aedeabc14d0f58`, migration `20261018120000` applied, `usage-upload` v10; Truth `custom-wall-fonts` PENDING_ACCEPTANCE. **Next:** Mazen's acceptance test with his own account (a real upload, apply, publish, visitor view, delete).

**Previous continuation (2026-10-18, font accordions; Upload My Font proposal):** the desktop font categories are accordions (§82), product `8da87669a346e831d8998a3b00323c96727a77a0` on TESTING (run `39103420138`). Upload My Font is **not implemented**: it needs a bucket, a table with RLS and RPCs, a published-read policy extension and Edge Function changes, so the proposal (storage accounting inside the existing 200 MB quota, no new paid service) is in `docs/WALL-EDITOR-TEXT-FONTS.md`. **Next:** Mazen's review and his decision on the font-upload proposal.

**Previous continuation (2026-10-18, My Wall Desktop Text & Fonts Phase 2):** Mazen authorized Phase 2: the desktop Text panel as a curated font library (categories, search, live samples, current state) and 11 OFL fonts (Fantasy & Gothic, Luxury Signature & Script). Product `936b665ebb2d445bd6e2ccbf1c0dce3e5bbe415d` on TESTING (run `39101612969`), with no migration or backend change; phone and tablet keep their design (§81, `docs/WALL-EDITOR-TEXT-FONTS.md`). Truth unchanged. **Next:** Mazen's visual review and final acceptance; Phase 3 is not authorized.

**Previous continuation (2026-10-18, My Wall Desktop Visual Redesign Phase 1):** Mazen authorized Phase 1 of the desktop Wall Editor redesign (fantasy-gaming shell, one original icon family, the Add panel); product `716b4e74df33b9bd50ee2f802dea2442f69a001a` on TESTING (run `39044158099`), desktop only (900px and wider), no behavior or data change, phone and tablet byte-identical (§80, `docs/WALL-EDITOR-DESKTOP-REDESIGN.md`). Truth unchanged. **Next:** Mazen's visual review; Phase 2 is not authorized.

**Previous continuation (2026-10-17, Intro landscape hint accepted):** Mazen gave final acceptance of the Intro landscape hint and fullscreen behavior exactly as implemented (§79, REV-0011), superseding the provisional approval. Truth `intro-landscape-hint` is ACCEPTED; checkpoint `77cfe4f`, contracts and TESTING `2889d3b` unchanged. Chrome's fullscreen notice stays a browser limitation (it shows the origin; a shorter future domain shortens the address only). Documentation only. **Next:** Mazen's next task.

**Previous continuation (2026-10-17, Mobile Public Visitor V2 accepted):** Mazen gave final acceptance of Mobile Public Visitor V2 (§78): Truth `public-profile-mobile-v2` is ACCEPTED, with checkpoint `ace0982`, its contracts and TESTING `2889d3b` unchanged. Documentation only. `intro-landscape-hint` stays PENDING_ACCEPTANCE under its provisional approval (Chrome's fullscreen notice documented as a browser limitation), and `your-gamid-editor-mobile` stays PENDING_ACCEPTANCE. **Next:** Mazen's next task.

**Previous continuation (2026-10-17, Mobile Public Visitor V2):** below 1280px `/@handle` now draws the Classic Profile in one mobile-first column, with the desktop components and the same public data (§77, `docs/PUBLIC-VISITOR-MOBILE-V2.md`). Product `ace098218bef771cd5b34afff2a9681cb4afb4b3`; Truth `public-profile-mobile-v2` is PENDING_ACCEPTANCE. **Next:** Mazen's manual visual and functional acceptance.

**Previous continuation (2026-10-17, Intro hint provisionally approved):** Mazen provisionally approved the Intro landscape hint refinement after his Emulator review (§76): the hint, 6 s timing and landscape fullscreen are correct, and Chrome's notice is a browser limitation. Truth `intro-landscape-hint` stays PENDING_ACCEPTANCE because this is not final acceptance. **Next:** Mobile Public Visitor V2 (`/@handle`), per Mazen's task of the same day.

**Previous continuation (2026-10-17, Intro landscape hint refinements):** Following Mazen's Emulator test (hint, tap → landscape fullscreen and video confirmed), the hint now shows for 6 s (fade from 5.5 s, still tappable). Chrome's "To exit full screen" notice is browser-owned and cannot be suppressed by the site; this is documented. Product `77cfe4fb90d51e321e3954ac10bcc6cdfb62f4d3`; Truth `intro-landscape-hint` is still PENDING_ACCEPTANCE (`PROJECT_HANDOFF.md` §75). **Next:** Mazen's manual verification.

**Previous continuation (2026-10-17, mobile Intro landscape hint):** Mazen's task added a brief animated phone-rotation hint to the shared Intro player, shown for landscape Intros on portrait phones. Tapping it gives landscape fullscreen, with a manual-rotation fallback. Product `c3113d0e887ee12878fdd9ec6e09501728c72749` (implementation `30653d1`); Truth `intro-landscape-hint` is PENDING_ACCEPTANCE (`docs/INTRO-LANDSCAPE-HINT.md`, `PROJECT_HANDOFF.md` §74). **Next:** Mazen's manual acceptance on Android. Overall Mobile V2 also remains PENDING_ACCEPTANCE.

**Previous continuation (2026-10-17, Mobile V2 visual fixes accepted):** Mazen manually verified the Mobile V2 visual parity fixes with his real account in the Android Emulator: TESTING `4786c59`, product `15e204d`; Intro thumbnail, My Games and My Crew artwork and the other parity corrections. He confirmed all are correct ("كلها صحيحة"). This is recorded in Product Memory REV-0009 and `PROJECT_HANDOFF.md` §73. **Only the visual fixes are accepted:** overall Mobile V2 (Truth `your-gamid-editor-mobile`) remains PENDING_ACCEPTANCE. **Next:** Mazen's decision on final acceptance of the overall Mobile V2 editor. The animated Intro rotation icon is not authorized.

**Previous continuation (2026-10-17, Mobile V2 visual parity audit):** Mazen's audit task aligned Mobile V2 with the Desktop media and summary content: Intro paused frame, game and Crew artwork, provider photos, About Me values, Duo badge, and the saved location and bio. It also fixed the hero text position and a teardown history issue. Product `15e204dcc8e324de3d32efc1e747b041424f45aa`; Truth `your-gamid-editor-mobile` is still PENDING_ACCEPTANCE (`PROJECT_HANDOFF.md` §72, `docs/PROFILE-EDITOR-MOBILE-V2.md`). **Next:** Mazen's manual verification in the Android Emulator.

**Previous continuation (2026-10-17, Mobile V2):** Mazen authorized implementing and deploying to TESTING the Mobile V2 "Profile Deck" (below 1024px: identity hero, section chips, six group cards, one editor at a time in a sheet, sticky Save All bar). Product `a0c7c95580e7e3375aa095fdc62de520059236ac`; Truth `your-gamid-editor-mobile` is PENDING_ACCEPTANCE. The accepted Desktop editor is unchanged. Details and evidence are in [`docs/PROFILE-EDITOR-MOBILE-V2.md`](docs/PROFILE-EDITOR-MOBILE-V2.md) and `PROJECT_HANDOFF.md` §71. **Next:** Mazen's Android Emulator review and acceptance decision. Arabic / RTL is deliberately out of scope: ten languages are planned as a separate localization task.

**Previous continuation (2026-10-16):** Mazen personally tested and accepted the three remaining TESTING features: game-catalog-manual-games, game-artwork-provisional (current provisional scope only) and landing-page. Existing implementation checkpoints/contracts preserved; no PENDING_ACCEPTANCE capabilities remain in Truth. Acceptance saved in REV-0008 and INDEX, technical reconciliation in PROJECT_HANDOFF.md §70 and docs/GAME-ARTWORK-STEAMGRIDDB.md. Documentation-only; no code/migration/deployment changes, Production or main merge. STOP after recording acceptance.

**Previous continuation (Desktop Editor acceptance, 2026-10-15):** Mazen manually accepted the deployed Desktop Profile Editor and authorized Product Memory saving. Truth `your-gamid-editor` is ACCEPTED for the implemented Desktop layout and editing behavior, product `61de6220a37922a776cddd19771b10bdac4fde51`, TESTING source `1ec1da3c934d83b27f025c1d6b1a5a2f20225ff2`, verified delivery checkpoint `446ba095578299c46f32547ac0f8bd6339e9c0ad`. Sources: [`docs/PROFILE-EDITOR-PAIRED-ROWS.md`](docs/PROFILE-EDITOR-PAIRED-ROWS.md), `PROJECT_HANDOFF.md` §62, existing IDEA-0001 and REV-0004. Acceptance-only documentation updates; no redeploy, functionality change or main merge. Stop after recording acceptance. Historical pending Desktop statements below are superseded; no new Android real-device acceptance or unrelated issue verification is implied.


**Previous stop point (historical):** product `4b56646` (ISS-0011 Intro storage lifecycle fix) was deployed to TESTING as head `72896d6` (run `38145293680`, full validation passed; migration `20261011240000`; `usage-upload` v9) and is PENDING Mazen's targeted manual check (§42). Documentation runs through `PROJECT_HANDOFF.md` §42.
- **ISS-0011:** FIXED, not VERIFIED. The three authorized failed Intro sources (29.38 MB) are deleted. Held for Mazen's decision: the removed 0.73 MB derivative, which is excluded from automatic cleanup by the cutoff. The 116.29 MB reservation releases by the 26-hour rule after 2026-10-12 12:41 UTC.
- **Intro source limit 50 MiB (Mazen's decision, §43):** implemented at `5214d9b`, migration `20261011260000` applied, deployed to TESTING as `af2af0d` (run `38147127030`, full validation passed); Truth `intro-identity.introSourceMaxBytes` = 52428800 (contract `intro-source-limit`). **Accepted by Mazen 2026-10-12 as the final limit** (§48); ISS-0012 VERIFIED. This acceptance covers the limit only.
- **ISS-0010 (editor Intro Preview returns to the editor, §44):** fixed at `7373607` (run `38148668016`), VERIFIED by Mazen 2026-10-11; he retested Skip on 2026-10-13 and confirmed the problem no longer occurs (PASS, no new code; §51).
- **ISS-0013 (My Socials marks for TikTok, Twitch, Kick, Snapchat on desktop, §45):** deployed as `514e462` (fix `ec3fda4`), **accepted by Mazen 2026-10-11**; ISS-0013 VERIFIED; Truth `desktop-social-marks` final (`classic-profile-desktop` ACCEPTED).
- **Public profile scroll bug (desktop, §46):** fixed and deployed at `5529d17`, **accepted by Mazen 2026-10-11**; recorded as ISS-0014 (VERIFIED).
- **My Socials: Spotify, SoundCloud and Vimeo (§47):** own artist / profile accounts only; deployed at `9e6e765` (run `38165131715`; migration `20261012100000`); Truth `my-socials` lists 12 platforms. **Accepted by Mazen 2026-10-12** (REV-0006, §48). Their logos on mobile too: `bc70717` (run `38166266548`, §48), PENDING Mazen's acceptance.
- **Wall Icon and Icon Group (DEC-0006, §49):** implemented at `efac19e` (run `38204748089`; migration `20261012120000`); Truth `wall-icons` **ACCEPTED by Mazen 2026-10-12** (DEC-0006 ACCEPTED, §50). The cancelled Wall Discord Profile Card task is not to be resumed.
- **Manual TESTING results (Mazen, 2026-10-13, §51):** Enable / Disable My Wall PASS and **ACCEPTED** (Truth `wall-visibility-toggle` ACCEPTED, DEC-0003 ACCEPTED); Discord PASS, then **DEC-0002 ACCEPTED** by Mazen the same day (§52; Truth `game-id-wall` note reconciled); Intro Preview Skip PASS (ISS-0010 stays VERIFIED). The cancelled Wall Discord Profile Card copy stays cancelled.
- **Gaming Roles (Mazen, 2026-10-13, §53):** final acceptance of the whole capability (all eight categories, the 71-role catalog, role selection, Primary Role, Classic Profile badges, Suggest a Role, administrator review). Truth `gaming-roles-categories` ACCEPTED (checkpoint `a1d2eeb`, limits and contracts unchanged); recorded in REV-0003.
- **Favorite Games (Mazen, 2026-10-13, §54):** final acceptance; Truth `favorite-games` ACCEPTED (maximum 4 favorites, contracts and checkpoint `506bfa7` unchanged); recorded in REV-0007.
- **Edit Crew Name (§55):** the owner renames a Crew inline in My Crew; implemented at `7fa7117` (run `38392848965`; migration `20261013100000`); Truth `crew-rename` **ACCEPTED by Mazen 2026-10-13** (§56). Crew names are now owner-editable, replacing the My Crew V1 immutable-name rule (game and owner stay immutable).
- **My Crews (Mazen, 2026-10-13, §56):** final acceptance of `my-crews-view` (the My Crews view, sizing, Crew Wall header logo, the 10-Crew membership limit) including the existing member invitation flow; Truth ACCEPTED (contracts, limits and checkpoint `a1d2eeb` unchanged).
- **Accepted 2026-10-11:** ISS-0009 is VERIFIED and Truth `visitor-media-access` is ACCEPTED (Mazen, including the accepted residual possibility of unknown historical signed URLs; §30, §38–§40).
- **Manual passes recorded, capability still pending:**
  - CP-01 (REV-0002) is now covered by the final acceptance of My Crews (2026-10-13, §56); GR-01 (REV-0003) by the final acceptance of Gaming Roles (§53).
  - ISS-0007: Mazen's Avatar save passed; the issue stays FIXED until his explicit security acceptance (§38–§39).
  - YOUR GAMID Editor (`your-gamid-editor`): Mazen passed all 16 desktop tests and accepted the tested desktop functionality (REV-0004, §41). **Android Chrome real-device acceptance is still outstanding**, so the capability stays PENDING_ACCEPTANCE.
- **Awaiting Mazen's acceptance (current Truth, 2026-10-19):** `wall-shapes-v2` (§90), `custom-wall-fonts` (§83) and `your-gamid-editor-mobile` (Mobile V2 Profile Deck, §71–§73; its visual parity fixes were manually accepted on 2026-10-17, REV-0009, but the overall capability is still pending). `public-profile-mobile-v2` (§78, REV-0010) and `intro-landscape-hint` (§79, REV-0011) were accepted on 2026-10-17; everything else registered was accepted by 2026-10-16 (§70; REV-0008); provisional/release conditions and unimplemented roadmap work remain separate.
- **Open conditions:**
  - SteamGridDB's written permission for distribution / commercial use is still outstanding, so artwork stays TESTING-only, with no Production / public release (§33–§35; `docs/GAME-ARTWORK-STEAMGRIDDB.md`).
  - The Discord Profile Card (ACCEPTED, §27) still needs a privacy policy for the Discord application.
  - @black's free-text Location is kept until he picks a country.
  - The TESTING administrator assignment (@black's owner account) is provisional and remains Mazen's decision (§37–§38).
- **Product Memory:**
  - DEC-0001 to DEC-0003 and DEC-0005 are IMPLEMENTED; DEC-0004 is ACCEPTED.
  - ISS-0001..ISS-0005 and ISS-0007 are FIXED, not VERIFIED; ISS-0006 and ISS-0008 are OPEN; ISS-0009, ISS-0010, ISS-0011, ISS-0012, ISS-0013 and ISS-0014 are VERIFIED.
  - The Register in `product-memory/INDEX.md` owns these statuses.

**Product Memory V1** (governance, structure, templates and validation) is committed on the working tip and awaits Mazen's acceptance. Saved records and their statuses are listed only in the Register of [`product-memory/INDEX.md`](product-memory/INDEX.md); rules are in `AGENTS.md` → Product Memory.

**Previously outstanding continuation (not performed in F2/F3/F4):**
1. **Remaining manual acceptance checks for global-usage.** Core accounting PASS; remaining checks are listed in `PROJECT_HANDOFF.md` §10. Mazen also reported a Global Usage Center PASS in Product Memory REV-0001 (2026-10-09); reconciling it with those checks is still needed, so the capability remains PENDING_ACCEPTANCE in Truth.
2. **Then the landing decision** for `main` (below).

- **Why landing needs a decision:** `main` (`da2e020`) is behind the working tip. A fast-forward would be clean in Git, but would also land work that Truth still marks PENDING_ACCEPTANCE:
  - `global-usage`.

  It would also land the unmerged GamID Truth docs and My Crew, which is accepted but not yet on `main`.
- **Options for Mazen:**
  - accept or defer global-usage, then decide whether to fast-forward `main` to the tip;
  - keep integrating on `feature/*` branches, with TESTING deployed from the tip.
- **Until then:** don't rewrite history and don't cherry-pick accepted fixes onto `main`.

## 8. Current test data

- **GM-TEST-01** has no stored objects since 2026-10-11: its synthetic Wall video (`pink_red_crown_loop.webm`, uploaded for the Assets pilot) was deleted with Mazen's authorization to close the known pre-fix signed URL (ISS-0009; `PROJECT_HANDOFF.md` §39). Its Assets entry (`wall_assets` 20694c6e) remains and points to the missing file. The saved Wall is unchanged and not published; the Monitor's open-assets pilot needs only the Assets panel, not an asset.
  - Earlier, the Assets pilot acceptance run added that video to the stage and undid it before any save, so the saved draft is unchanged.
- **@black and @zshot** were not used for this pilot and remain protected.
- **No credentials or secrets** are stored here or anywhere in either repository. Persona secrets live outside the repositories; see `../gamid-monitor/docs/PERSONAS.md`.

## 9. What this file must NOT become

This file must never become:
- a duplicate of GamID Truth;
- a bug database;
- a Monitor evidence store;
- a changelog;
- a conversation transcript;
- a design backlog;
- a place for secrets;
- a replacement for Git.

When it conflicts with an authoritative or specialist source, **that source wins**: fix this file to point to it. Monitor never sends this file to an AI model; the Observer's product context comes only from `gamid-truth.json`.
