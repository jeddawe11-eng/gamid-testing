create function private.avatar_is_public(candidate_path text)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.entities e
    where e.avatar_media_reference = candidate_path
      and e.entity_type = 'SOLO'
      and e.visibility = 'PUBLIC'
  );
$$;

drop policy "public identity avatars are readable" on storage.objects;

create policy "public identity avatars are readable"
on storage.objects for select to anon, authenticated
using (bucket_id = 'avatars' and private.avatar_is_public(name));

revoke all on function private.avatar_is_public(text) from public, anon, authenticated;
grant execute on function private.avatar_is_public(text) to anon, authenticated;
