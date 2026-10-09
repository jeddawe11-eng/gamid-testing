-- Classic Profile Banner - Phase 1C security containment (DEC-0005, ISS-0009) - GamID TESTING only.
--
-- Phase 1B proved live that anonymous SELECT on a Storage object also lets an anonymous visitor mint a signed URL for it (POST /storage/v1/object/sign/...,
-- any expiresIn - one year was accepted). Signed URLs are checked only by their signature and expiry, so such a link kept serving the Banner after the GamID
-- became PRIVATE and after the Banner was detached. Visitors must therefore never hold SELECT on a Banner object.
--
-- This removes ONLY the anonymous / public Banner read policy added by 20261010120000_profile_banner.sql. Kept unchanged: the Banner columns and owner RPCs, the
-- restrictive "attached banners cannot be deleted" policy, every Avatar / Intro / Wall policy, usage-upload v6, quotas and limits. Banners are then readable
-- only by their owner (the accepted gateway receipt read policy); public delivery is a separate, approved design. private.banner_is_public(text) stays defined
-- but is no longer referenced by any policy.

drop policy "public profile banners are readable" on storage.objects;
