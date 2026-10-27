-- Infrastructure Optimization & Security Hardening V1 (Mazen's task 2026-10-27) - GamID TESTING only. Bounded retention for pg_cron's run log.
--
-- cron.job_run_details had no retention: the one-minute play-together-voice-reconcile-testing job (docs/PLAY_TOGETHER_TEAM_ROOM_VOICE.md: "A one-minute interval
-- is suitable for TESTING") adds 1,440 rows a day, 38,106 rows / 22 MB on 2026-10-27 (the largest table in the database). The job and its schedule are unchanged.
-- This adds ONE daily job that deletes run-log rows that ended more than 7 days ago, so the log holds about 10,100 rows at any time. Only finished rows of the
-- run log are ever deleted (end_time set and older than 7 days); cron.job, the jobs themselves and every application table are untouched.
-- Idempotent: an existing job of the same name is replaced. Rollback: select cron.unschedule('gamid-cron-log-retention');
select cron.schedule(
  'gamid-cron-log-retention',
  '17 3 * * *',
  $$delete from cron.job_run_details where end_time is not null and end_time < now() - interval '7 days'$$
);
