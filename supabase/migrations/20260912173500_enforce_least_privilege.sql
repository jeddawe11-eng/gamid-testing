revoke insert, update, delete, truncate, references, trigger
on public.entities, public.entity_memberships, public.profiles, public.qr_references
from authenticated;

revoke all
on public.entities, public.entity_memberships, public.profiles, public.qr_references
from anon;

grant select
on public.entities, public.entity_memberships, public.profiles, public.qr_references
to authenticated;

