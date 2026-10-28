-- Public Intro still poster: add @black to the TESTING acceptance gate (Mazen's authorization 2026-10-28, "Real Intro Poster Visual Acceptance on @black").
-- The synthetic GM-TEST-01 Intro is not enough to judge visual quality, so Mazen's own TESTING profile @black is activated for his review. The gate stays
-- in place (20261027140000): GM-TEST-01 and @black only; every other account keeps the earlier waiting-frame behavior.
-- Nothing of @black changes: its Intro, derivative, chosen frame, share copy, settings and Wall are not touched. The only effects are:
--   1. one activation row;
--   2. posters queued for @black's CURRENT active Intro only (its first frame and its chosen frame), through the same gated function the trigger uses.
--      The deployed worker generates them from the existing playback derivative; nothing is re-encoded or replaced. This is not a backfill: no other
--      profile is queued.
-- Rollback (restores the earlier waiting frame at once, without touching the Intro): worker/cloud-run/intro-poster-gate-black-rollback.sql.

do $$
declare black uuid; found_count integer;
begin
  select count(*), min(p.profile_id::text)::uuid into found_count, black
  from public.entities e
  join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = 'black' and e.entity_type = 'SOLO';
  if found_count <> 1 then raise exception 'INTRO_POSTER_GATE_BLACK_NOT_FOUND'; end if;
  insert into private.intro_poster_activation (profile_id, reason)
  values (black, 'Mazen 2026-10-28: real-Intro visual acceptance review on his TESTING profile @black');
  perform private.enqueue_intro_posters(black);
end $$;
