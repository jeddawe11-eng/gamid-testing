# F5 — native Intro delivery (TESTING)
Status: ACCEPTED by Mazen (manual TESTING acceptance, 2026-10-07). Mazen confirmed that the TESTING Intro streaming behavior passed manual acceptance and explicitly ACCEPTED F5. The accepted product checkpoint remains 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59. This acceptance record changes documentation/state only; no product or deployment change. Mazen authorized implementation and the maximum 120-second signed capability window on 2026-10-07. F2/F3/F4 remain accepted. Broader Intro identity acceptance remains separately deferred.

## Architecture and authorization
Account no longer downloads its saved Intro on load. Preview freshly reads current authenticated owner + get_my_intro, requires the active READY derivative, and signs that exact owner path. Public playback freshly resolves get_public_identity (PUBLIC identity + active READY derivative), signs anonymously under the existing Storage SELECT policy, then rechecks the publication/path after signing. Replay always revalidates before reusing a lease.

intro-source.js keeps one source in memory per controller. It validates exact project/origin/bucket/path, actual JWT expiry and a maximum 120-second requested/issued lease. Reuse requires 35 seconds remaining (30-second Intro maximum plus transition margin); otherwise it re-signs. Generation/actor guards reject late results after close, replacement, unpublication or account change. No persistent private Intro URL/Blob cache is introduced.

No database, RLS, bucket, Storage metadata, codec or worker change. Legacy Blob API helpers remain for compatibility; normal owner/public Intro consumers no longer call them. Pending local upload previews retain local Blob URLs.

## Lifecycle and security
The existing Intro Engine receives the native URL, crossOrigin=anonymous and the lease expiry. Natural ending, all five transitions, audio, seeking, ambient treatment, profile/Wall reveal and Split live clones remain. Skip, close, pagehide, logout/session changes, replacement and owner visibility changes stop playback, detach src, call load(), remove Split clones and stop ambient work. Expiry also releases consumers. Late play/sign promises cannot restart a terminated player.

Foreground revalidation and every Replay detect changed/unpublished public state. There is no new polling/subscription: a remote change while continuously foreground can remain visible until a lifecycle recheck or the bounded lease timer. Existing downloaded/browser-cached bytes cannot be remotely revoked. The signed URL is a bearer capability outside the app for at most 120 seconds; this tradeoff was explicitly approved. No private bucket becomes public. No service credential is exposed.

## Technical validation / measurement
Dedicated synthetic F2 fixture reused unchanged (landscape 409,804 bytes, three seconds); no existing user media reprocessed. Chromium desktop Chrome 155.0.8059.39. Local readonly HTTP server: Range + ETag, no-cache, 8,192 bytes/100ms, fresh isolated contexts. Server-written response body bytes are measured separately from logical file size; no Supabase traffic for these playback comparisons.

| Phase | Whole Blob | Native |
|---|---:|---:|
| Cold startup | 5,679ms | 909ms |
| Body received before playback | 409,804 | 65,536 |
| Complete playback body | 409,804 | 409,804 |

Actual Intro Engine early Skip: 81,920 server-written body bytes, connection closed before end, zero further bytes over 1.1 seconds after release. All five natural transitions released sources; Split close removed both clones; expiry release, local Blob preview, seeking and forced autoplay rejection → Tap to play passed. Same-tab replay and revisit after a complete cached load transferred zero additional body bytes in this controlled ETag test. These are synthetic results, not CDN/mobile measurements or projected user savings; fast/small clips may buffer fully before Skip.

Independent CDP check of the same early-release scenario: encodedDataLength 73,728 bytes, dataLength 81,920 bytes, server-written body 81,920 bytes. All three counters remained unchanged for 1.1 seconds after release; HTTP 206 bytes=0- closed early. CDP encoded accounting differs from logical/body delivery and is reported without conflating them.

A bounded real TESTING public signing probe: 120-second lease resolved, same URL reused after fresh identity lookup; HTTP 206, one response-body byte, CF MISS, no Cache-Control response header. This establishes actual signed/Range compatibility only. No full real Intro downloads or user writes.

Automated regressions cover expiry/renewal, wrong object/origin, malformed/overlong capabilities, replacement/unpublishing during signing, logout/account switch, failed signing without stale fallback, owner READY, anonymous vs owner request headers, lazy Account delivery, release of main/Split sources, initial handshake/idempotency and stale callbacks. Full build and deployment results are recorded below after completion.

Run the browser transport/engine smoke with an installed Playwright module:
F5_PLAYWRIGHT_MODULE=<absolute Playwright module path> node scripts/intro-f5-browser.cjs
It uses Chrome headless, ephemeral localhost, readonly fixture files and no user session. It does not test real Android/iOS codecs or real autoplay policy; those require manual acceptance.

## Manual acceptance checklist (reference)
URL: https://gamid-testing-static.gamid.workers.dev/prototypes/intro-derivative-f2/?delivery=f5
Use desktop Chrome, real Android Chrome and iPhone/iOS Safari if available:
1. Play Landscape, Portrait and Small. Confirm shape, quality, expected audio/silence, ambient treatment and natural profile reveal.
2. Try Fade, Blur, Shrink, Slide and Split. Split must stay seamless without black/blank flashes or duplicate audio.
3. Replay, Skip early, then Replay; use Skip / Release during Split. Playback must stop and restart normally. Tap to play must work if autoplay is blocked.
4. Navigate away/back and reload in the same tab. No continuing audio or unexpected restart.
5. Read-only product acceptance: visit a published GamID, test natural Wall/Profile reveal, Skip and Replay. Account load must not fetch its Intro; opening Preview must work, closing must stop it; local pending upload Preview remains normal. Do not save/change someone else's media for this check.

Fixture is public synthetic media, not an authentication simulation. Authorization/lifecycle cases are automated; no real-user replacement/unpublication/logout media test is performed by automation. Mazen has explicitly ACCEPTED the F5 TESTING streaming behavior (2026-10-07). His acceptance did not separately enumerate a device/browser matrix; this record does not infer additional device-specific evidence.

## Rollback / continuation
Revert only F5 product changes on the feature continuation branch and redeploy exact reverted checkpoint to TESTING. No migration/worker/storage rollback is necessary. Do not roll back F2/F3/F4. F5 manual acceptance is complete. STOP; no F6/F7 or other optimization authorized.

## Deployment record
Local final build: 1,650 tests, 1,649 PASS, one codec-dependent skip, zero failures; lint/typechecks PASS. Fourteen focused F5 regressions PASS. Real-engine browser smoke PASS as detailed above. Product checkpoint: 4a978ab5e35d6f9d028f1dd9cb80faf0c2b5fd59. Pushed only feature/play-together-notifications. TESTING deployment run [37563242127](https://github.com/jeddawe11-eng/gamid-testing/actions/runs/37563242127) succeeded (39 seconds); exact requested/resolved SHA and staged artifact verified. Eight changed served modules match the exact commit after the established staging LF normalization. Account/public/Intro iframe/fixture HTML stamps are 4a978ab, with no placeholders. Live desktop Chrome at 390×844: Landscape/Split, Portrait/Fade and Small/Shrink natural endings and source release PASS; Replay/Skip-release PASS; no page errors. This viewport check is not real-mobile acceptance. No worker/backend deployment required. F5 is now manually ACCEPTED by Mazen (2026-10-07); the deployment checkpoint remains unchanged.

Files changed: dist/account/{account.js,supabase-client.js,intro-preview.js,intro-source.js,intro-release.js}; dist/public/public.js; dist/prototypes/intro-derivative-f2/{fixture.js,f5-fixture.js}; tests/{intro-streaming-f5.test.js,public-intro-handshake-reliability.test.js,my-duo.test.js}; scripts/intro-f5-browser.cjs; package.json; gamid-truth.json; PROJECT_STATE.md; PROJECT_HANDOFF.md; this record. Existing source-shape handshake/Skip assertions were updated for the asynchronous resolver/shared termination without changing the protected behavior.
