create function private.intro_media_is_public(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.entities e
    join public.profiles p on p.entity_id = e.entity_id
    join public.profile_intro_settings s on s.profile_id = p.profile_id
    join public.intro_processing_jobs j on j.job_id = s.active_job_id
    where j.derivative_path = candidate_path
      and j.state = 'ready'
      and e.entity_type = 'SOLO'
      and e.visibility = 'PUBLIC'
  );
$$;

create policy "public identity intro media are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'intro-media' and private.intro_media_is_public(name));

revoke all on function private.intro_media_is_public(text) from public, anon, authenticated;
grant execute on function private.intro_media_is_public(text) to anon, authenticated;
