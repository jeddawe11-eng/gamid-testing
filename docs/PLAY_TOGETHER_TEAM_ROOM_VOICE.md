# Play Together Slice 2A — Team Room + Voice Foundation (TESTING)

Starting checkpoint: `6b6af3a3ac88222998286873e3ad029e22ff2046`. This slice extends the accepted Play Together `ROOM_OPEN` state. It does not change matching, invitations, host approval, Ready Check, canonical room state, or Wall/Templates behavior.

## Boundary

GamID remains authoritative for the Play Together session, accepted membership, Team Room and lifecycle. Voice is a replaceable provider selected by `provider_key`. V1 registers `discord`; future native/desktop voice implements the same provider operations: ensure participant, ensure session, produce a join target and end session.

Private tables hold voice-provider identifiers and state. Authenticated clients can only use narrow RPCs that re-derive `auth.uid()`, require accepted membership, and return a safe Team Room projection. Bot credentials, provider channel IDs for other rooms, OAuth state and service operations are never exposed through direct table grants.

## Lifecycle

`PENDING → PROVISIONING → READY → ACTIVE → ENDING → ENDED`, with `FAILED` carrying a bounded error code and retry time. One unique voice session belongs to one Play Together session. A provisioning lease serializes retries. Discord channel names use the deterministic voice key `team-<12 hex>`; after a crash between Discord creation and database finalization, a retry lists the configured category and adopts the matching voice channel instead of creating another.

When a Play Together session becomes `COMPLETED`, `CANCELLED` or `EXPIRED`, the reconciliation endpoint claims its channel with row locking, deletes it at Discord, then records `ENDED`. A Discord 404 counts as successful cleanup. This endpoint is designed for an external scheduler and does not depend on a player's browser.

## Discord V1

The existing GamID Discord connection remains the identity authority. Its current `identify connections` OAuth flow is unchanged and continues to revoke tokens immediately. Team Voice adds a separate, explicit `identify guilds.join` consent. The callback verifies that Discord's authenticated user ID exactly matches the already-linked `gaming_connections.provider_account_id`, adds that user to the one configured GamID guild through Discord's supported bot flow, and immediately revokes the OAuth grant. No Discord user token is retained.

The bot creates one type-2 voice channel in the configured Team Voice category. `@everyone` is denied View Channel and Connect. Only the session's Discord-linked and voice-authorized GamID participants receive View Channel, Connect and Speak. The bot receives the channel-level permissions needed to manage cleanup. Join Team Voice returns `https://discord.com/channels/<guild>/<channel>` only after the server revalidates GamID membership, linked Discord identity, voice membership and ready state. Discord still owns the final click to enter voice.

`CONNECTED` is supported as a service-only presence update for a future bot Gateway worker. REST provisioning alone reports `READY`; it does not invent live voice presence.

## One-time TESTING setup

1. Use one TESTING Discord application and one GamID TESTING guild. Never reuse Production credentials.
2. Add the existing callback URL for `play-together-voice-authorize-callback` to the application's OAuth2 redirects.
3. Install the bot into that guild. Required guild permission: Manage Channels. It also needs View Channel and Connect in the Team Voice category. Do not grant Administrator.
4. Create a private Team Voice category and record its snowflake.
5. Set these Supabase Edge Function secrets: `DISCORD_BOT_TOKEN`, `DISCORD_GUILD_ID`, `DISCORD_TEAM_VOICE_CATEGORY_ID`, `DISCORD_BOT_USER_ID`, and a random `PLAY_TOGETHER_VOICE_RECONCILE_SECRET`. Existing `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` remain required.
6. Deploy the four Slice 2A functions after applying migration `20260930170000_play_together_team_room_voice.sql` to TESTING.
7. Configure a server-side scheduler to POST to `/functions/v1/play-together-voice-reconcile` with `x-gamid-reconcile-secret`. A one-minute interval is suitable for TESTING. Do not put this secret in browser code or a public workflow log.

Discord OAuth scope required from each Team Voice participant: `identify guilds.join`. Bot installation scope: `bot`. No `voice`, RPC, email, guild-list, messages, or Administrator access is requested.
