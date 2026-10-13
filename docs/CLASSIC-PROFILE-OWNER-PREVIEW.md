# Saved Classic Profile owner preview (TESTING)

Implemented at `41aa90692c164d9675698131f561b285cdc8b736` on `feature/play-together-notifications`, from synchronized GitHub HEAD `2d8a657e400c85676ed9996ac867a27fc8125a1a`. Authorized by Mazen's Account Live Preview replacement task and its continuation (2026-10-14). **PENDING owner acceptance.**

## Account action and return

- The oversized Live Preview card, draft summary and decorative circle are removed. **Preview Your GamID Classic** is a compact action with a saved-profile explanation.
- The former card's GamID Publish / Unpublish controls remain in a separate **GamID visibility** row. The existing **My Wall** control and its publication semantics are preserved. **Share your GamID** remains.
- The action opens a full-screen dialog above Account. **Back to Edit** closes and removes only its iframe; Account remains at `/account/` throughout. Focus returns to the Preview button.
- No form, save, discard prompt, publication or upload is triggered by Preview. Fields, expanded sections, workflow drafts, pending cropped Avatar, local Intro selection, transition selection, Banner, About Me and staged visibility stay in the original Account document. The editor's existing departure/unload guards still apply to real navigation.
- The selected Avatar thumbnail moves to the Avatar editor section, preserving the existing crop / apply / save workflow.

## Rendering and saved data

`dist/public/public.js` remains the single Classic host. The owner frame opens `/public/?classic-preview=owner`, which selects the authenticated read-only adapter `dist/account/classic-profile-source.js`.

- The owner is resolved through the existing authenticated `get_my_identity_profile`, never a handle or entity supplied in the URL. A query naming another handle cannot select its private data.
- For a PUBLIC owner, the adapter reuses the anonymous public projections verbatim: identity/sections, About Me, Socials, Discord card, Favorite Games, Crews and paginated My Games. The owner's saved Avatar uses the existing authenticated media read.
- For an unpublished owner, the adapter reads the existing owner APIs, projects only Classic presentation fields and applies **saved** section opt-ins. Account's existing game-library merge is reused; discovered games are read in bounded pages. No provider discovery, lookup, refresh, cleanup, mutation or new backend API is invoked.
- Education & Work, Discord / Steam, League, My Games, playtime, ranks/stats, Duo, About Me fields and Discord card retain their respective saved controls. Other people's GamIDs and Crew Walls retain their public gates; private partners, pending invitations and private members are not included. No email, private account fields, OAuth credentials or draft values enter the Classic renderer.
- The adapter feeds the actual existing Classic components: desktop hero, Banner, About Me, roles, Socials, game lists/details, Favorite Games, Connected Games and My Crews. Below the desktop breakpoint it uses the existing mobile Classic frame and sections. The current desktop-only About Me / Banner / My Crews presentation is preserved; no new mobile sections or unsupported hobbies field is invented.
- This mode skips the Wall lookup and sends an empty video source to the existing profile frame. It never starts Intro, signs Intro media, or exposes Replay Intro. The independent editor Intro Preview and public visitor Intro are untouched.
- Owner media URLs exist only in memory and are released when the frame is destroyed. Missing/refused images use the existing Classic fallback. Snapshot access is guarded against owner changes; sign-out/account switching closes or invalidates the preview. Server authorization, RLS, anonymous readers and media policies are unchanged.

## Validation

- Full required `npm run build`: **1902 tests; 1901 PASS, 1 existing opt-in SKIP, 0 failures**, plus lint, syntax checks and voice syntax checks. Local loopback tests require execution outside the Windows network sandbox; no actual Cloud Run job is invoked.
- `tests/owner-classic-preview.test.js`: saved opt-ins and field allowlists, game provenance / privacy, PUBLIC projection reuse, unpublished owner without writes, signed-out refusal, owner-switch protection, and Account / Classic wiring.
- `scripts/classic-preview-browser.mjs`: Chrome at **1440** and **390** pixels; no-edits PRIVATE preview; Wall unpublished, disabled and enabled; saved Classic identity, bio, roles, school, Socials, games, Duo and desktop About Me / My Crews; Back to Edit; pending cropped Avatar and a valid local Intro file preserved across every round trip; no save/publication/media upload or Intro request; unauthorized access refused; no page errors.
- Same harness: ordinary public Classic at both widths is **pixel-identical to starting checkpoint `2d8a657`** (`GAMID_BASELINE_ROOT`); ordinary visitors still receive a published Wall. The legacy `public-desktop-browser.mjs` has pre-existing one-column placement assertions superseded by the accepted two-column implementation; no Classic layout code was changed to satisfy them.
- Existing `scripts/profile-editor-browser.mjs`: **2/2 PASS** (1280 and 390); 18 sections after removal of the Preview accordion, isolated saves / Save All, visibility, feedback, crop, Intro controls, Banner/About Me, Socials, My Wall, sign-out, stale saves and account switching; no page errors or horizontal overflow. Its removed-card expectation and collapsed role-category fixture interaction were updated to match current UI.
- Existing Intro Preview end, Wall, public profile, Duo, roles, account, privacy and catalog regressions pass in the complete suite. Only assertions that explicitly pinned the removed draft card, or the new owner bypass/default paging argument, were changed.
- Browser checks use intercepted backend requests and isolated fixture sessions. They do not modify real accounts, stored objects or publications and do not claim Android-device or owner acceptance.

Reproduce browser checks with installed Playwright/Chrome via `GAMID_BROWSER_MODULE`, `GAMID_CHROME_PATH` and `GAMID_BROWSER_OUTPUT`; optionally `GAMID_BASELINE_ROOT` points to the starting `dist/`. `--live` exercises deployed TESTING frontend files with the same fully mocked backend. The development MP4 for the valid local Intro draft comes from local `dist/assets/gamid-intro.mp4`; it is not deployed or uploaded.

## Delivery and governance

Frontend only: no database migration, Edge Function, worker, authentication/RLS or Production change. No branch merge, history rewrite or Product Memory modification. The authorized Cloudflare TESTING workflow accepts an exact branch and expected SHA, validates the full build, stamps the frontend and smoke-checks it. Deployment confirmation is recorded here after that workflow completes.

**GamID Truth: UPDATED** — `your-gamid-editor` records the saved Classic preview contract and product checkpoint; the obsolete Live Preview wording in the Gaming Roles selector is reconciled. Existing acceptance statuses and limits are unchanged.

**Product Memory: PROPOSED** — a concise decision record for replacing the draft card with a saved Classic owner preview, preserving drafts by keeping Account alive. No Product Memory record or Register entry is saved; separate Mazen approval is required.

Stop after TESTING verification for Mazen's review and acceptance.
