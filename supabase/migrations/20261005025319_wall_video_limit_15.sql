-- TESTING: change the existing canonical limit; all consumers already use it.
-- CREATE OR REPLACE preserves the existing function identity and permissions.
create or replace function private.wall_video_limit()
returns integer language sql immutable set search_path='' as $$select 15$$;
