-- Media delivery Architecture F - TESTING pilot (DEC-0013): enabling, in TWO separate steps, each only with Mazen's explicit approval. GM-TEST-01 only (the
-- private.media_r2_pilot list); every other account keeps today's behavior exactly whatever these switches say. Prerequisites: migration
-- 20261029100000_media_r2_pilot.sql applied; the Worker deployed with the R2 binding and both secrets; public-media deployed with MEDIA_R2_SIGNING_KEY; the
-- worker image (media-r2-replica.mjs) + dispatcher deployed with GAMID_MEDIA_R2_INGEST_URL / _KEY (deploy-media-r2-pilot-testing.sh).

-- Step 1 - replication: queue GM-TEST-01's current Intro derivative and Discord share copy; each queued row dispatches one worker run.
update private.media_r2_settings set replication_enabled = true, reason = 'Pilot replication enabled with Mazen''s approval', updated_at = now() where singleton;
select private.media_r2_backfill_pilot() as replicas_queued;
-- then wait until both are READY (verified size + SHA-256):
-- select source_bucket, state, attempts, source_bytes, replica_bytes, replica_sha256, failure_code from public.media_r2_replicas order by created_at;

-- Step 2 - delivery (only after Step 1 shows READY replicas, and with the Worker var MEDIA_R2_DELIVERY = "on"):
-- update private.media_r2_settings set delivery_enabled = true, reason = 'Pilot delivery enabled with Mazen''s approval', updated_at = now() where singleton;

-- Watching the cost bounds:
-- select * from private.media_r2_fallback_usage order by day desc;      -- Supabase fallback bytes counted for pilot media without a ready replica
-- select count(*) from public.media_r2_replicas where created_at > now() - interval '1 day';   -- against replications_per_day
