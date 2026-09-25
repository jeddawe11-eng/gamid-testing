-- Cover every foreign key added by the complete Play Together milestone.
create index play_together_positions_game_idx on public.play_together_positions(game_key);
create index play_together_positions_experience_idx on public.play_together_positions(experience_key) where experience_key is not null;
create index play_together_sessions_position_idx on public.play_together_sessions(position_key) where position_key is not null;
create index play_together_members_representative_idx on public.play_together_members(represented_by_entity_id) where represented_by_entity_id is not null;
create index play_together_members_position_idx on public.play_together_members(position_key) where position_key is not null;
create index play_together_ready_responses_member_idx on public.play_together_ready_responses(member_id);
create index play_together_ready_responses_actor_idx on public.play_together_ready_responses(responded_by_entity_id) where responded_by_entity_id is not null;
create index play_together_avoids_game_idx on public.play_together_avoids(game_key);
create index play_together_events_member_idx on public.play_together_events(member_id) where member_id is not null;
create index play_together_last_setup_game_idx on private.play_together_last_setup(game_key);
create index play_together_last_setup_experience_idx on private.play_together_last_setup(experience_key);
create index play_together_last_setup_queue_idx on private.play_together_last_setup(queue_key);
create index play_together_last_setup_region_idx on private.play_together_last_setup(region_key);
create index play_together_last_setup_position_idx on private.play_together_last_setup(position_key) where position_key is not null;
create index play_together_last_setup_source_idx on private.play_together_last_setup(source_session_id);
