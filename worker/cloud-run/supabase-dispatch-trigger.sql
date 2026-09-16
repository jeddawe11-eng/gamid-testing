-- PREPARED TEMPLATE ONLY. Do not apply until the Cloud Run dispatcher exists
-- and both values below have been inserted into Supabase Vault.
-- Required Vault names:
--   gamid_intro_dispatch_url_testing
--   gamid_intro_dispatch_secret_testing

create extension if not exists pg_net with schema extensions;

create or replace function private.dispatch_intro_processing_job()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  dispatcher_url text;
  dispatcher_secret text;
begin
  select decrypted_secret into dispatcher_url
  from vault.decrypted_secrets
  where name = 'gamid_intro_dispatch_url_testing';

  select decrypted_secret into dispatcher_secret
  from vault.decrypted_secrets
  where name = 'gamid_intro_dispatch_secret_testing';

  if dispatcher_url is null or dispatcher_secret is null then
    raise exception using errcode = '55000', message = 'INTRO_DISPATCH_NOT_CONFIGURED';
  end if;

  perform net.http_post(
    url := dispatcher_url || '/dispatch',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-gamid-dispatch-secret', dispatcher_secret
    ),
    body := jsonb_build_object(
      'type', 'INSERT',
      'schema', 'public',
      'table', 'intro_processing_jobs',
      'record', jsonb_build_object('job_id', new.job_id, 'state', new.state)
    ),
    timeout_milliseconds := 5000
  );
  return new;
end;
$$;

revoke all on function private.dispatch_intro_processing_job() from public, anon, authenticated;

drop trigger if exists dispatch_intro_processing_job on public.intro_processing_jobs;
create trigger dispatch_intro_processing_job
after insert on public.intro_processing_jobs
for each row
when (new.state = 'pending')
execute function private.dispatch_intro_processing_job();
