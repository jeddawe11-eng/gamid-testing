-- Public Intro still poster: queue posters for EXISTING active Intros (TESTING only). Run ONLY after the worker image from deploy-intro-poster-testing.sh is
-- deployed and its poster-smoke passed, and only with Mazen's explicit authorization: it applies to every account with an active Intro, real accounts
-- included, whose public page then shows the still poster instead of seeking the video. New Intros and new thumbnail choices are queued automatically.
-- Each queued row dispatches one worker run (the same Vault-held dispatcher as every Intro job); the per-profile bound (20 per hour) still applies.
-- Undo for a single profile: update public.intro_posters set state = 'superseded', claim_token = null, updated_at = now() where profile_id = '<id>' and
-- state in ('pending', 'processing', 'ready'); (the page then seeks the video again; the sweep deletes the objects later).
select count(*) as profiles, sum(queued) as posters_queued
from (
  select private.enqueue_intro_posters(s.profile_id) as queued
  from public.profile_intro_settings s
  where s.active_job_id is not null
) q;
