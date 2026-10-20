---
id: REV-0021
title: Public Wall bandwidth baseline before F6–F8
status: COMPLETED
created: 2026-10-21
updated: 2026-10-21
scope: TESTING Public Wall Visitor, F1–F5 measured baseline, pre-F6–F8
summary: Claude Code measured repeatable real-browser wire transfer and identified repeat video downloads; this is an audit, not product acceptance.
related: []
save_approval: Mazen 2026-10-21
review_type: AUDIT
outcome: PASS
reviewer: Claude Code
truth_refs: []
checkpoints: [88ff3419e098a713139b64b1b9708deb7323c0fa, 22cbc85b86b8f2eddf4cfb0c1a077e5f59c75b5e]
sources: [docs/WALL-BANDWIDTH-BASELINE.md, PROJECT_HANDOFF.md]
---

## Subject

Anonymous live TESTING Public Wall Visitor at /@black, after F1–F5 and before F6–F8. Audit results are not acceptance of any new optimization.

## Method

Claude Code used Playwright with Chrome DevTools Protocol, Chrome 155, desktop 1440×900 and Pixel 7 mobile emulation; cold/warm/new-tab visits, stage navigation, idle, complete video playback, replay, pause/resume and seeking. Key scenarios repeated three times per profile; one mobile Fast-4G-like run. Actual CDP encoded wire bytes were counted, including network-filled HTTP Range responses sometimes flagged as disk cache.

## Results

- All stages, cold: 41.46 MB transferred; initial before interaction 19.06 MB desktop versus 28.50–28.77 MB mobile.
- New-tab revisit: 32.30 MB; same-tab warm reload: 2.28 MB; complete 11-scenario session: 76.04 MB.
- Video accounts for 87.6% of full-session transfer; new signed URLs lead to repeated video downloads (~30 MB). Intro reloads 2.20 MB each visit.
- Stage-3 GIF (2.01 MB) loads before reaching stage 3; PNG 2.40 MB; third-party SteamGridDB artwork 3.56 MB.
- No playback errors/stalls or observed visual degradation in tested sessions. Physical iOS/Android devices were not tested.
- Supabase billed Egress was not measured; CDN HIT/MISS is not equivalent to billed Egress.

## Follow-up

F6 secure private-media caching is the leading measured opportunity; F7 responsive image delivery and stage-aware loading warrant study; F8 preview/loading savings cannot be quantified from this baseline alone. Mazen approved an engineering research/planning task for F6–F8, **not implementation**. Preserve original media, quality, access control, revocation and current accepted contracts. Re-run the documented benchmark after any separately authorized implementation. Mobile Wall Editor V2 remains PENDING_ACCEPTANCE.

## History

- 2026-10-21 COMPLETED — Claude Code baseline audit recorded; Mazen explicitly approved Product Memory save. No feature implementation or acceptance.
