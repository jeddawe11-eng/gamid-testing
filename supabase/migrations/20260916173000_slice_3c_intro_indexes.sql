create index profile_intro_settings_active_job_id_idx
  on public.profile_intro_settings(active_job_id)
  where active_job_id is not null;
