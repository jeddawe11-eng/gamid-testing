-- Public Intro still poster: roll out to every account on TESTING (Mazen's authorization 2026-10-28, "Roll Out Public Intro Poster to All TESTING Accounts").
-- The acceptance gate (20261027140000) limited posters to the profiles listed in private.intro_poster_activation (GM-TEST-01, @black). This adds one switch:
-- while private.intro_poster_rollout.all_accounts is true, every profile is activated, so new accounts, new Intros and new chosen frames get posters
-- automatically through the unchanged trigger. Every gate check (queue, claim, complete, serve) keeps calling private.intro_poster_activated, so the switch
-- is the only change in behavior; the per-profile list stays as it is.
-- Existing Intros are NOT queued here: the separate, bounded backfill does that (worker/cloud-run/intro-poster-backfill.sql, one profile at a time).
-- Rollback, instant and without a migration: update private.intro_poster_rollout set all_accounts = false, updated_at = now(); every profile outside the
-- list then has no poster served at once (its page seeks the video again) and its queued rows are superseded at the next claim; the sweep deletes the
-- objects later. Original Intros, chosen frames, share copies and settings are never touched.

create table private.intro_poster_rollout (
  singleton boolean primary key default true check (singleton),
  all_accounts boolean not null,
  reason text not null,
  updated_at timestamptz not null default now()
);
alter table private.intro_poster_rollout enable row level security;
revoke all on table private.intro_poster_rollout from public, anon, authenticated;
insert into private.intro_poster_rollout (all_accounts, reason)
values (true, 'Mazen 2026-10-28: roll out the accepted public Intro poster to all TESTING accounts');

create or replace function private.intro_poster_activated(candidate_profile_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select r.all_accounts from private.intro_poster_rollout r where r.singleton), false)
    or exists (select 1 from private.intro_poster_activation a where a.profile_id = candidate_profile_id);
$$;
