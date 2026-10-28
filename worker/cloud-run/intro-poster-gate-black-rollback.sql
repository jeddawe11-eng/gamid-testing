-- Public Intro still poster: roll back @black's review activation (migration 20261028100000), TESTING only, only on Mazen's instruction.
-- Effect is immediate: get_public_intro_poster('black') returns the same chosen frame with no poster, so @black's page waits on the paused video again
-- exactly as before; the storage policy stops serving its posters. @black's Intro, derivative, chosen frame, share copy, settings and Wall are not touched.
-- Its poster rows become superseded; the worker's storage sweep deletes their objects on its next run (after the 10-minute grace period).
-- GM-TEST-01 stays activated; the gate itself stays in place.
begin;
with black as (
  select p.profile_id from public.entities e join public.profiles p on p.entity_id = e.entity_id
  where e.gamid_handle = 'black' and e.entity_type = 'SOLO'
)
delete from private.intro_poster_activation a using black b where a.profile_id = b.profile_id;
update public.intro_posters r set state = 'superseded', claim_token = null, completed_at = coalesce(r.completed_at, now()), updated_at = now()
where r.profile_id = (select p.profile_id from public.entities e join public.profiles p on p.entity_id = e.entity_id where e.gamid_handle = 'black' and e.entity_type = 'SOLO')
  and r.state in ('pending', 'processing', 'ready');
commit;
