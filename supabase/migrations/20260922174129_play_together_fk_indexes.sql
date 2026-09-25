-- Play Together FK indexes identified by the Supabase TESTING performance advisor after the foundation migration.
-- Forward-only and isolated to the new Play Together tables.
create index play_together_experiences_game_idx on public.play_together_experiences (game_key);
create index play_together_queue_regions_region_idx on public.play_together_queue_regions (region_key);
create index play_together_queues_rule_set_idx on public.play_together_queues (rule_set_id);
create index play_together_sessions_game_idx on public.play_together_sessions (game_key);
create index play_together_sessions_experience_idx on public.play_together_sessions (experience_key);
create index play_together_sessions_queue_idx on public.play_together_sessions (queue_key);
create index play_together_sessions_rule_set_idx on public.play_together_sessions (rule_set_id);
create index play_together_sessions_region_idx on public.play_together_sessions (region_key);
