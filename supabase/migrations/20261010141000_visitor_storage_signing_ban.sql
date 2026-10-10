-- Phase 1D security remediation, part 2 (ISS-0009) - GamID TESTING only. Applied AFTER public-media is deployed and the public page asks it for leases, so no
-- accepted page ever depends on visitor signing at the moment it stops working. See 20261010140000_visitor_storage_signing.sql for the full rationale.
--
-- Only the folder owner (<uid>/...) may sign a Storage object. This RESTRICTIVE policy narrows every SELECT policy while Storage performs a signing operation
-- (storage.operation() is storage.object.sign / storage.object.sign_many, observed live on TESTING); every other operation - direct reads, which re-check RLS
-- on each request - is unchanged. Service credentials (the Edge Functions) bypass RLS and are unaffected.
create policy "only owners can sign storage objects"
on storage.objects as restrictive for select to anon, authenticated
using (coalesce(storage.operation(), '') !~* 'sign' or split_part(name, '/', 1) = coalesce((select auth.uid())::text, ''));