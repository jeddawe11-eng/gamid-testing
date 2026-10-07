# Cloudflare TESTING authentication migration prerequisite

2026-10-07. Product checkpoint: `2eacf6896f7a8edfcb137ac91889bde34bfe7f03`.
Continuation branch: `feature/play-together-notifications`; base `dc9393f0463345fa16eaed3d0c7d3227c051030a`. No main merge.

**MANUALLY ACCEPTED by Mazen; legacy Pages RETIRED (2026-10-07).** Cloudflare is the canonical TESTING frontend: https://gamid-testing-static.gamid.workers.dev/.
Mazen authorized retirement after all six manual migration/provider checks passed. Pages is unpublished; its workflow is disabled globally and inert on the branch. Cloudflare is the sole active TESTING frontend.

## Implemented contract

- Signed-out Play Together navigates to Cloudflare Account sign-in. Wall Editor presents its normal private gate; its Account link uses Cloudflare and remembers the editor intent.
- Account, Play Together and Wall Editor use the existing same-origin session client/localStorage lifecycle. No legacy Account hop or cross-origin access/refresh-token transfer remains. A single-use sessionStorage note contains only an allowlisted path (/play-together/ or /wall-editor/), expires after five minutes and is consumed only by authenticated Cloudflare Account. Recovery stays in Account. No new session engine or arbitrary destination.
- Discord connection start permits the exact Cloudflare origin; callback returns to Cloudflare Account. OAuth redirect URI remains the same TESTING Supabase function URL. State binding, expiry, consumption, code exchange, identity linking, revocation, scopes and JWT policies are unchanged.
- League lookup now permits Cloudflare rather than the old Pages origin. Steam callback success/error always returns to Cloudflare; legacy in-flight signed return_to assertions still undergo their exact original validation. Steam games retains its existing two exact CORS origins as incoming-only compatibility. Informational provider/catalog User-Agent links now identify Cloudflare.
- TESTING Supabase Auth Site URL and sole allowed redirect URL are https://gamid-testing-static.gamid.workers.dev/account/. No wildcard was added. The old Pages redirect was removed. Default confirmation/recovery templates use {{ .ConfirmationURL }}; no hard-coded Pages link. No provider secrets or registered Discord callback changed.
- No database migration, bucket/RLS/media/quota/worker/notification/Wall engine/Team Voice business-logic change. F2/F3/F4/F5 remain accepted and unchanged.

## Audit and remaining legacy references

Audited dist runtime modules/routes, cf-worker, worker, scripts, Supabase shared modules/migrations, the targeted LIVE Edge Function sources, TESTING Auth URL configuration and default email templates, deployment configuration and current continuation records.
Live database read-only pg_proc search across non-system schemas found no function body referencing the Pages host/account path. Cloudflare/static/browser fixture requests made no legacy host requests.

Remaining references are intentional and do not require Pages for a Cloudflare flow:

| Location | Meaning |
| --- | --- |
| .github/workflows/deploy-pages.yml and github-pages repository settings | Retired: site unpublished, workflow disabled globally and inert on the branch. Do not reactivate without authorization. |
| steam-openid.js | Exact legacy incoming origin and signed assertion site key compatibility. Both callback return addresses are Cloudflare. |
| steam-games.js, wall-assets.js, media-poster.js, usage-upload.js, play-together-voice.js | Existing exact incoming CORS allowlists also accept legacy Pages. Cloudflare is independently allowed. These never route a Cloudflare client to Pages. Incoming-only compatibility remains deliberately unchanged; no active frontend depends on these entries. |
| tests | Negative-origin, compatibility and historical regression fixtures; not client destinations. |
| PROJECT_HANDOFF.md / GAMID_ROADMAP.md / older specialist records | Historical deployment evidence; current canonical-host notices supersede old hosting descriptions. |
| Public identity route/base-path helpers and 404 | Generic relative/base-path compatibility, with no legacy host dependency. Preserve unrelated routing. |

## Exact product files changed

```text
dist/account/account.js
dist/account/post-auth-return.js
dist/account/supabase-client.js
dist/account/testing-auth-handoff.js
dist/play-together/play-together.js
dist/prototypes/game-id-wall-w0/README.md
dist/wall-editor/editor.js
dist/wall-kit/auth-gate.js
scripts/catalog/wikidata-export.mjs
supabase/functions/_shared/discord-oauth.js
supabase/functions/_shared/league/league-service.js
supabase/functions/_shared/league/opgg-adapter.js
supabase/functions/_shared/steam-games.js
supabase/functions/_shared/steam-openid.js
supabase/functions/_shared/steam-profile.js
tests/cloudflare-auth-migration.test.js
tests/game-catalog-contract.test.js
tests/game-catalog-expansion.test.js
tests/play-together-cross-origin-auth.test.js
tests/shared-auth-session.test.js
tests/steam-openid.test.js
tests/wall-w3-editor.test.js
```

Continuation/state record changes: gamid-truth.json, PROJECT_STATE.md, PROJECT_HANDOFF.md, this document, GAMID_ROADMAP.md (historical notice), docs/global-usage-center.md, docs/GLOBAL_AUTHENTICATED_SHELL.md and wrangler.jsonc (comment only).

## Deployment evidence

GitHub Cloudflare TESTING workflow run **37590268654**, successful, source_ref and workflow branch feature/play-together-notifications; expected/resolved SHA 2eacf6896f7a8edfcb137ac91889bde34bfe7f03. Root tree afe200c58c3fc406493d269254767d3977bc74ef. TESTING worker gamid-testing-static; Wrangler 4.86.0. Both Account and Play Together stamps are 2eacf68.

Supabase project **upvtrczefcvigxdyuylw (GamID — TESTING)** only:

| Function | Deployed version | verify_jwt |
| --- | ---: | --- |
| discord-connect-start | 11 | true |
| discord-connect-callback | 11 | false |
| steam-connect-start | 10 | true |
| steam-connect-callback | 11 | false |
| steam-games-refresh | 11 | true |
| league-lookup | 10 | true |

Before deployment all affected live function files matched the base repository; after deployment all six retrieved bundles matched the committed modules and JWT policies. Team Voice functions were not redeployed; their existing Cloudflare return and CORS were verified.

## Validation and limits

- npm run build: lint + authenticated-shell audit + syntax/typecheck + voice typecheck PASS; 1,651 tests, 1,650 PASS, one existing native-FFmpeg-dependent skip, zero failures. Includes complete Discord success/state/security tests, Steam signed-assertion/replay/cross-origin tests, Team Voice consent/provisioning/cleanup tests and accepted product regressions.
- Initial focused authentication/Wall/Discord/Steam/League run: 178/178 PASS. New Cloudflare-specific preflight/callback/security contract tests also pass in the full build.
- Isolated desktop Chrome browser against local files and against the actual served Cloudflare frontend: signed-out Play Together -> Account -> sign-in -> intended Play Together; signed-out Wall gate -> Account -> sign-in -> editor; reload; Account session restoration; Account sign-out -> signed-out gate. All PASS, zero page errors, zero Pages requests. Backend responses were isolated fixture stubs; no real user signed in/out or mutated.
- Live IAB signed-out Play Together redirects to Cloudflare Account/sign-in; Wall gate link does likewise. No real owner data loaded or changed.
- Live exact-origin OPTIONS probes on Discord, Steam start/refresh, League and Team Voice start/voice: 204, Cloudflare allow-origin; unrelated origin has no allow-origin. Missing-state callbacks return 302 to Cloudflare with invalid_state, without consuming a valid attempt or modifying an account/session.
- Live Auth verify probes with deliberately invalid tokens: Cloudflare, old Pages and unrelated redirect requests all return 303 to Cloudflare Account. No confirmation, recovery email, valid token or user mutation.
- 17 live frontend files match LF-normalized/stamped product sources byte-for-byte, including accepted F5/F4/F3 modules. Root, Account, Play Together, Wall Editor and public /@black HTML routes return 200; no user media downloaded.
- Actual Discord/Steam provider success and real Team Voice joins were NOT replayed against protected accounts; success paths were exercised by automated backend fixtures. Mazen should manually confirm these before final retirement acceptance. No Production/main/Monitor access or changes.

## Historical pre-retirement manual checklist (now completed)

1. In Cloudflare TESTING, sign out normally; open /play-together/. Sign in at Cloudflare Account and verify automatic return to Play Together, then reload.
2. Signed out, open /wall-editor/; choose Go to your account, sign in, verify return to the editor. Reload; verify the normal owner Wall and notification bell. Do not alter the saved Wall just for this test.
3. Open Account directly; confirm session restoration and normal sign-out. Open a published /@handle and confirm normal public profile/Intro/Wall behavior.
4. From Cloudflare Account, connect/reconnect Discord with the normal owner consent: authorize, return to Cloudflare Account, confirm connected status. If appropriate, also verify Steam connect/refresh from Cloudflare.
5. In an intended manual TESTING Team Room, verify existing Discord consent/Team Voice join/completion/cleanup behavior. The agent did not create or change real sessions for testing.
6. When satisfied, explicitly authorize retiring GitHub Pages. A later task can disable the legacy workflow/site and remove obsolete compatibility origin entries. Do not merge main automatically.

## Historical pre-retirement rollback (requires new authorization now)

Keep Pages enabled until authorized retirement. Re-deploy the previous frontend product 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59 and previous affected function sources from dc9393f if rollback is required; restore the previous exact Auth URL settings together with the old cross-origin client. Do not mix an old client with a partially rolled-back origin/callback configuration. No database rollback or secret rotation is needed.

## Manual acceptance and completed retirement — 2026-10-07

Mazen reported PASS: signed-out Play Together/sign-in/automatic return; Wall Editor/sign-in/return/reload; Discord reconnect OAuth/Cloudflare return; Team Voice provisioning/join; Steam refresh; Public Profile/Intro/Wall. Migration is ACCEPTED.

Authorized retirement: unpublished Pages and disabled deploy-pages.yml repository-wide, including the older default-branch workflow without modifying main. The continuation branch workflow is a skipped read-only tombstone. Git history, old runs and historical records remain. Application code, user data, provider callbacks, secrets, RLS and Supabase configuration are unchanged. No frontend redeployment is required; live application remains accepted 2eacf68.

Legacy backend incoming CORS origins and exact Steam assertion compatibility remain; none are outbound frontend dependencies. Do not reactivate Pages through historical rollback instructions without fresh explicit authorization.

### Retirement verification

- GitHub UI confirmed “GitHub Pages unpublished” and “This workflow was disabled manually.” Previous workflow runs remain visible.
- Independent live HTTP checks: Pages root, /account/, /play-together/, /wall-editor/ and /public/ each 404, no GamID application. Cloudflare equivalent routes each 200.
- Eight live Cloudflare application files matched accepted 2eacf68 sources byte-for-byte after normal deployment stamping. Frontend/backend runtime audit found no outgoing Pages links; six retained backend host references are incoming CORS/Steam compatibility only.
- Isolated live-frontend Chrome fixtures: Play Together and Wall Editor sign-in return, reload, Account session restoration and sign-out PASS; zero legacy requests or page errors. Backend is intercepted with fixtures; no real account/session mutated.
- TESTING Supabase Site URL and sole Redirect URL remain Cloudflare /account/. Discord/Steam/Voice Edge Function versions and JWT policies are unchanged and ACTIVE; missing-state callbacks return 302 to Cloudflare. No valid OAuth attempt or real Team Room was touched.
- Focused auth/hosting/Truth/provider tests: 119/119 PASS. Full build: 1,650 tests, 1,649 PASS, one existing F2 native-FFmpeg skip, zero failures; lint/typecheck/typecheck:voice PASS.
- Retirement changes only workflow, directly affected regression tests, staging/configuration comments and authoritative records. No Production, main merge or Monitor changes. STOP.
