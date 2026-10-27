---
id: ISS-0018
title: pg_cron run log (cron.job_run_details) grows without bound
status: FIXED
created: 2026-10-27
updated: 2026-10-27
scope: TESTING database, pg_cron; the one-minute play-together-voice-reconcile-testing job
summary: The one-minute voice-reconcile job adds 1,440 run-log rows a day with no retention (38,106 rows / 22 MB, the largest table); a daily retention job now keeps 7 days (about 10,100 rows), job and schedule unchanged.
related: [REV-0030]
save_approval: Mazen 2026-10-27
kind: IMPROVEMENT
authorization: Mazen 2026-10-27, task "GAMID — Infrastructure Optimization & Security Hardening V1" (step 6, TESTING only)
truth_refs: []
checkpoints: [bcbdc7d75a26e3750a90db069f9f71a9ab4f5741]
sources: [docs/INFRA-OPTIMIZATION-V1.md, docs/PLAY_TOGETHER_TEAM_ROOM_VOICE.md, PROJECT_HANDOFF.md]
---

## Description

- **The cause.** pg_cron logs every run in `cron.job_run_details` and has no retention of its own.
- **The job.** TESTING's only job, `play-together-voice-reconcile-testing`, runs every minute (`* * * * *`). Its setup guide says a one-minute interval suits TESTING, so its frequency is kept.
- **The effect.** The log grew 1,440 rows a day: 38,106 rows / 22 MB on 2026-10-27, since 2026-10-01, with no failed runs. It was the largest table in the database.

## Evidence

- **Before (live query):**
  - 38,118 rows;
  - the oldest from 2026-10-01;
  - 10,080 rows in the last 7 days;
  - 0 failed runs.
- **Jobs:** only job 1 existed (the reconcile).

## Resolution

- **The change.** Migration `20261027120100_cron_log_retention.sql`, applied on TESTING. It adds one daily job, `gamid-cron-log-retention` at 03:17 UTC. The job deletes only finished run-log rows (`end_time` set) older than 7 days.
- **What it never touches.** `cron.job`, the reconcile job and its schedule, and every application table.
- **Rollback.** `cron.unschedule('gamid-cron-log-retention')`.
- **Verification (Claude Code, TESTING):**
  - the job's own delete was run once, taking 38,118 rows to 10,080, with the oldest now 2026-10-20;
  - both jobs are active;
  - the reconcile kept running (newest run after the change).
- **Not done.** Disk space is reused through autovacuum; no VACUUM FULL was run, because it locks the table.

## History

- 2026-10-27 OPEN — found by the infrastructure cost study (REV-0030).
- 2026-10-27 AUTHORIZED — Mazen's task "Infrastructure Optimization & Security Hardening V1", step 6.
- 2026-10-27 FIXED — retention job applied and run once on TESTING (checkpoint bcbdc7d); awaiting Mazen's verification.
