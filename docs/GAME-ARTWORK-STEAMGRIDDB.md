# Game artwork: provisional SteamGridDB evaluation (TESTING only)

**Status: provisional technical evaluation, approved by Mazen on 2026-10-11.** Commercial artwork rights are **not** confirmed. This is not authorization for a public or commercial rollout.

## Licensing questions (open)

1. **Terms.** SteamGridDB's Terms of Use (<https://www.steamgriddb.com/terms>, effective 2019-07-31 as read on 2026-10-11) describe access for personal, non-commercial use within the normal functionality of the service. They also restrict automated use and redistribution.
   - Does GamID's use (a product profile page, even on TESTING) fall inside them?
   - Is a written permission or a commercial agreement needed?
2. **Artist copyright.** Uploaders keep the copyright in their artwork and license it to SteamGridDB and its users "to the extent permitted by the Service". Does that licence reach a third-party product?
3. **"Official" assets.** Logos and icons labelled *official* are publishers' trademarks. That label is not proof that GamID may display them.
4. **Caching and attribution.** Permitted cache duration, attribution and hotlinking rules are not documented.
   - The evaluation caches metadata only (7 days) and hotlinks the provider CDN.
   - This must be confirmed before any rollout.
5. **Visitor privacy.** Images load from `cdn2.steamgriddb.com`, so a visitor's browser contacts that host (no referrer is sent). A production design may need a proxy or self-hosted assets, which brings its own licence questions.

## Enabling and disabling it

| Action | How |
|---|---|
| **Enable** | Mazen creates a personal API key (Steam login → steamgriddb.com → Preferences → API) and stores it as the Supabase Edge Function secret `STEAMGRIDDB_API_KEY`. The key is never committed and never reaches the browser. Without it, the function asks the provider nothing and the profile shows its initials tiles. |
| **Disable at once** | `update private.game_artwork_settings set enabled = false;` hides every image immediately. Or remove the secret. |
| **Remove** | Delete the cache (`private.game_artwork_cache`), remove the function and the CSS / JS slots. No user data depends on it, and existing user-uploaded artwork is not touched (there is none today). |

## Architecture

`GET /functions/v1/game-artwork/<handle>` (`supabase/functions/_shared/game-artwork.js`):
- public;
- origin-checked;
- 30 requests per minute per pseudonymous client key.

1. **What may get artwork.** `game_artwork_targets(handle)` (service role only) returns only what a visitor already sees on that PUBLIC GamID:
   - its library games while My Games is public;
   - `league_of_legends` while its League account is public;
   - the games of the Crews its public section lists.
2. **Matching. Exact or nothing.**
   - A catalog **Steam app id** (`game_catalog_provider_ids`, provider `steam`) → `/games/steam/{appid}`.
   - Otherwise `/search/autocomplete/{title}` is accepted only when **exactly one** result has the same normalized title **and** the same release year (when the catalog knows it).
   - Anything else is `NO_MATCH`. A similar title, a different year or an ambiguous search never gets a guessed image.
3. **Images.**
   - Icon: `styles=official,custom`.
   - Grid: `460x215` / `920x430`.
   - Hero, for Crews only: `types=static&nsfw=false&humor=false&epilepsy=false&limit=1`.
   - Only `https://cdn2.steamgriddb.com/...` URLs are accepted, in the function, in a database check constraint and in the page.
4. **Budget.**
   - At most 6 new lookups per request (connected and Crew games first), each with a 4-second timeout.
   - A timeout, 429, 401/403, 5xx or network error stops further lookups for that request and caches nothing for that game.
   - Results (`MATCHED` / `NO_MATCH`) are cached for 7 days.
5. **Page.** `dist/public/game-artwork.js` places an `<img referrerpolicy="no-referrer">` over the initials tile. A Crew card gets a CSS background layer over its gradient. A broken image is removed, and the initials or gradient stay.
   - Requested only when the desktop Classic Profile shows. Mobile makes no artwork request.

## Coverage on TESTING

Measured with live keys only once Mazen has set the secret. See `PROJECT_HANDOFF.md` §33.
- **Steam-id coverage:** the catalog holds Steam ids for 7,559 of 27,182 games, and 45 of the 82 Steam-discovered games map to the catalog.
- **Without a Steam id:** the strict title + year rule decides (e.g. League of Legends).
