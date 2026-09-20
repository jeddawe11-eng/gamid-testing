-- Intro source upload limit (150 MiB = 157,286,400 bytes) - live database behavior test (GamID TESTING only).
--
-- Run manually:  supabase db query --linked -f tests/integration/intro-source-limit-db.sql
-- (Requires migration 20260921100000 to be applied. To validate the migration BEFORE applying it, run the migration's content and this file's
--  content wrapped together in one always-failing statement: everything rolls back either way.)
--
-- Uses ONLY a disposable auth user / identity created inside the transaction and impersonates authenticated exactly as PostgREST does.
-- It never creates a processing job or a storage object (every probe stops at an error), so nothing can reach the dispatcher, and it ALWAYS
-- raises an exception carrying the results, so the whole transaction rolls back. Expected: TEST_RESULTS: followed by a JSON array, all "pass": true.

do $test$
declare
  res jsonb := '[]'::jsonb;
  ua uuid := gen_random_uuid();
  job uuid := gen_random_uuid();
  got text;
  n integer;
  def text;
  lim bigint;
  lim_media bigint;
  mimes text;
  path text;
  jobs_before integer; jobs_after integer;
begin
  select count(*) into jobs_before from public.intro_processing_jobs;

  -- the three server-side enforcement points carry the new number
  select b.file_size_limit into lim from storage.buckets b where b.id = 'intro-sources';
  select b.file_size_limit, null into lim_media, mimes from storage.buckets b where b.id = 'intro-media';
  select array_to_string(b.allowed_mime_types, ',') into mimes from storage.buckets b where b.id = 'intro-sources';
  res := res || jsonb_build_object('step', 'BUCKET: intro-sources accepts objects up to exactly 157286400 bytes (150 MiB); the mime allow-list is unchanged', 'pass', lim = 157286400 and mimes = 'video/mp4,video/quicktime,video/webm', 'got', lim);
  res := res || jsonb_build_object('step', 'BUCKET: the derivative bucket intro-media is unchanged (15728640 bytes, webm only)', 'pass', lim_media = 15728640);

  select pg_get_constraintdef(c.oid) into def from pg_constraint c where c.conrelid = 'public.intro_processing_jobs'::regclass and c.conname = 'intro_processing_jobs_source_size_bytes_check';
  res := res || jsonb_build_object('step', 'TABLE CHECK: source_size_bytes is limited to 1..157286400', 'pass', def like '%157286400%' and def not like '%104857600%', 'got', def);
  select pg_get_constraintdef(c.oid) into def from pg_constraint c where c.conrelid = 'public.intro_processing_jobs'::regclass and c.conname = 'intro_processing_jobs_output_size_bytes_check';
  res := res || jsonb_build_object('step', 'TABLE CHECK: the derivative size ceiling is unchanged (15728640)', 'pass', def like '%<= 15728640)%', 'got', def);
  select pg_get_constraintdef(c.oid) into def from pg_constraint c where c.conrelid = 'public.intro_processing_jobs'::regclass and c.conname = 'intro_processing_jobs_source_duration_ms_check';
  res := res || jsonb_build_object('step', 'TABLE CHECK: the duration limit is unchanged (500..30000 ms)', 'pass', def like '%500%' and def like '%30000%', 'got', def);

  insert into auth.users (id, email, email_confirmed_at) values (ua, 'zintro-a@example.invalid', now());
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated; perform 1 from public.create_solo_identity('zintroa', 'Zed Intro', date '1990-01-01', 'en'); reset role;
  path := ua::text || '/' || job::text || '/source.mp4';

  -- RPC boundary (probes stop at an error: no job, no storage object)
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  set local role authenticated;
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 157286401::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: 157286401 bytes (one byte over the new limit) is refused with INTRO_SOURCE_TOO_LARGE', 'pass', got = 'INTRO_SOURCE_TOO_LARGE', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 157286400::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: exactly 157286400 bytes passes the size check (it then stops because no such upload exists)', 'pass', got = 'INTRO_SOURCE_NOT_FOUND', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 104857601::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: 104857601 bytes (over the OLD limit) is now accepted by the size check', 'pass', got = 'INTRO_SOURCE_NOT_FOUND', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 0::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: 0 bytes is still refused', 'pass', got = 'INTRO_SOURCE_TOO_LARGE', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 5000000::bigint, 30001); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: the duration limit is unchanged - 30001 ms is refused', 'pass', got = 'INTRO_DURATION_INVALID', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 5000000::bigint, 499); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: the duration limit is unchanged - 499 ms is refused', 'pass', got = 'INTRO_DURATION_INVALID', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 5000000::bigint, 30000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: exactly 30000 ms is still accepted by the duration check', 'pass', got = 'INTRO_SOURCE_NOT_FOUND', 'got', got);
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/avi', 5000000::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'RPC: the allowed source types are unchanged (AVI is refused)', 'pass', got = 'INVALID_INTRO_TYPE', 'got', got);
  reset role;

  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  set local role anon;
  begin perform 1 from public.queue_my_intro(job, path, 'fade', 'video/mp4', 5000000::bigint, 20000); got := 'NO_ERROR'; exception when others then got := sqlerrm; end;
  reset role;
  res := res || jsonb_build_object('step', 'anon still cannot call the RPC', 'pass', got like 'permission denied%', 'got', got);

  -- the table CHECK is an independent, last-line limit (tested as the table owner, inside the rolled-back transaction, on a constraint-only basis:
  -- the insert fails on the CHECK before any trigger can fire)
  begin
    insert into public.intro_processing_jobs (job_id, profile_id, owner_user_id, requested_transition, source_path, source_mime, source_size_bytes, source_duration_ms)
    select gen_random_uuid(), p.profile_id, ua, 'fade', ua::text || '/x/source.mp4', 'video/mp4', 157286401, 20000 from public.profiles p join public.entity_memberships m on m.entity_id = p.entity_id where m.user_id = ua limit 1;
    got := 'NO_ERROR';
  exception when check_violation then got := 'CHECK_VIOLATION'; when others then got := sqlerrm; end;
  res := res || jsonb_build_object('step', 'TABLE CHECK: a row with 157286401 source bytes cannot be inserted by any path', 'pass', got = 'CHECK_VIOLATION', 'got', got);

  select count(*) into jobs_after from public.intro_processing_jobs;
  res := res || jsonb_build_object('step', 'no processing job was created and no existing job row changed', 'pass', jobs_before = jobs_after and not exists (select 1 from public.intro_processing_jobs j where j.source_size_bytes > 157286400));

  res := res || jsonb_build_object('step', 'SUMMARY', 'pass', not exists (select 1 from jsonb_array_elements(res) e where (e->>'pass') is distinct from 'true'), 'total', jsonb_array_length(res));
  raise exception 'TEST_RESULTS:%', res::text;
end
$test$;
