create policy "public identity avatars are readable"
on storage.objects for select to anon, authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.entities e
    where e.avatar_media_reference = storage.objects.name
      and e.entity_type = 'SOLO'
      and e.visibility = 'PUBLIC'
  )
);
