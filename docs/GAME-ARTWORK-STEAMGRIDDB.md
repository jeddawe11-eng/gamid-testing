# Game artwork: SteamGridDB evaluation (TESTING only)

**Status (2026-10-11):**
- **Live and working, on the GM-TEST evaluation personas only.**
- **Public activation: BLOCKED** until SteamGridDB grants written permission. Every other public profile, real users included, keeps the initials tiles.
- This is not a commercial licence.

## What the provider allows (reviewed 2026-10-11)

**Sources:**

| Document | Where it was read | Fingerprint (SHA-256 prefix) |
|---|---|---|
| API reference: OpenAPI v2.10.0, `https://www.steamgriddb.com/static/openapi.yml`, rendered at `https://www.steamgriddb.com/api/v2` | — | `7D390F6E6F52B0EB` |
| Terms of Use, `https://www.steamgriddb.com/terms` | Text taken from the site's own Terms page bundle | `0713D2DABE12AF9A` |

**API reference.**
- Authentication: `Authorization: Bearer <token>`, a personal key from the user's Preferences.
- The reference states **no** rate limit, cache rule, attribution rule, licence or API-specific terms.
- No separate API terms were found.

**Terms of Use** (the only terms). The relevant restrictions, paraphrased:
1. Access only for the user's **personal, non-commercial use**, within the normal functionality of the Service.
2. No use for soliciting business or **in connection with a commercial enterprise**.
3. No **distribution of any part** of the Site or Service without SteamGridDB's **explicit written permission**.
4. No **automated use** of the Site, Service or related systems, and nothing that imposes an unreasonable load.
5. **Uploaded artwork:** uploaders keep ownership. They grant other users a licence only to the extent permitted by the Service and these Terms. Game logos and art are also third-party trademarks and copyrights; an *official* label is not a licence.

**Assessment** (not legal advice):
- **Allowed with the owner's personal key:** a small, owner-run technical evaluation through the official API, shown only on dedicated test personas. Mazen chose this interpretation on 2026-10-11.
- **Needs written permission:** showing the artwork on GamID's public profiles, including real users on TESTING, and any public or commercial launch. That is distribution in connection with a product.
- Until then the evaluation allowlist (below) stays in place.

## Permission request (draft for Mazen to send)

> **Subject:** Permission request: displaying SteamGridDB artwork in GamID
>
> Hello SteamGridDB team,
>
> I'm building GamID, a gaming-identity platform (not yet publicly launched) where players show the games they play on a profile page. I'd like to use the SteamGridDB API to display a small icon, grid or hero image next to each game on a player's profile.
>
> - **Lookups:** server-side only, with my personal API key, by exact Steam App ID (falling back to an exact title + release-year match). At most 6 lookups per profile view.
> - **Caching:** only the image URLs are cached, for 7 days. No images are re-hosted; they load from your CDN.
> - **Content filters:** static, non-NSFW, non-humor, non-epilepsy images only.
> - **Attribution:** artwork credited to SteamGridDB (and the artist, if you require).
>
> Your Terms of Use limit use to personal, non-commercial purposes and require explicit written permission for distribution. Could you tell me whether you can grant written permission for this use, now for a public beta and later for a commercial service? And under what conditions: attribution, rate limits, caching, a commercial agreement or fees, artist consent, or removal requests?
>
> Today it runs only on internal test profiles, with a kill switch.
>
> Thank you,
> Mazen (GamID)

## Enabling, restricting, disabling

| Control | Current state / how |
|---|---|
| Key | `STEAMGRIDDB_API_KEY` is set (2026-10-11, by Mazen) as a Supabase Edge Function secret. It is never committed and never reaches a browser. The function reports only `configured: true/false`. |
| Evaluation allowlist | `private.game_artwork_settings.evaluation_handles` = `gm_test_01, gm_test_02` (migration `20261011140000`). Other handles get `enabled:false` and no artwork. Set it to `null` **only** after written permission and Mazen's approval. |
| Kill switch | `update private.game_artwork_settings set enabled = false;` hides everything at once (verified live). |
| Removal | Delete `private.game_artwork_cache` and remove the function. No user data depends on it. |

## How it works

`GET /functions/v1/game-artwork/<handle>` (`supabase/functions/_shared/game-artwork.js`).

- **Access:**
  - public, origin-checked;
  - 30 requests per minute per pseudonymous client: the 27th request in a burst was refused with 429 live, because page loads in the same minute count too.
- **Targets** (`game_artwork_targets`, service role): only what a visitor already sees on that PUBLIC, allowlisted GamID: its public My Games, a public League account, and its public Crews.
- **Matching:**
  - The catalog **Steam app id** → `/games/steam/{appid}`.
  - Otherwise `/search/autocomplete/{title}`, accepted only when exactly **one** result has the same normalized title **and** the same release year.
  - Anything else is `NO_MATCH`, and the tile keeps its initials.
- **Images:**
  - icon: official/custom PNG;
  - grid: 460×215 or 920×430;
  - hero: for Crews;
  - all static, with `nsfw=false&humor=false&epilepsy=false`.
  - Only `https://cdn2.steamgriddb.com/…` URLs are accepted (function, database CHECK and page).
- **Budget and errors:**
  - At most 6 new lookups per request, each with a 4-second timeout.
  - Timeout, network error, 401/403, 429, 5xx, or a malformed 200 (not JSON, or not `{ success: true, data }`): further lookups stop for that request and nothing is cached for that game.
  - Cache: `MATCHED` / `NO_MATCH` rows hold metadata only, for 7 days.
- **Page:** an `<img referrerpolicy="no-referrer">` over the initials tile, and a background layer over a Crew card's gradient. A broken image is removed. Desktop only.

## Live evaluation (2026-10-11, GM-TEST-01)

16 catalog games:
- 12 with a Steam id, including the ambiguous titles *Doom* (two catalog entries) and *Prey* (two);
- 4 without one: League of Legends, Valorant, Fortnite, Minecraft.

They sat in My Games (public); there were also 3 published Crews (League, Valorant, Rocket League).

| Result | Value |
|---|---|
| Requests to resolve all 16 | 3 (6 + 6 + 4 lookups); 5.6 s, 4.1 s, 3.4 s; well under 100 provider calls |
| Matched | **15** (12 by Steam id, 3 by exact title + year: Fortnite, League of Legends, Valorant) |
| Fallback (initials) | **1**: Minecraft: the strict rule found no single SteamGridDB result with the same title and the catalog year 2009 (or no static image for it), so it keeps its initials rather than a guessed image |
| Visual check of every image (contact sheet) | 15/15 depict the right game. **Caveat:** *Doom* (Steam 2280) shows "DOOM I+II", because Steam app 2280 is today's combined DOOM + DOOM II product; correct for the id, broader than the catalog title. |
| Images returned / loaded in a real browser | 33 / 33 (icons, grids, 3 heroes) |
| My Games (desktop preview) | 6/6 rows with loaded artwork; Game Details still opens |
| My Crews | 3/3 cards with a loaded artwork background and game icon; links unchanged |
| Connected Games | No genuine linked game account on the test persona, so nothing was shown and none fabricated. The real League account (@black) is outside the allowlist by design; its artwork display is covered by the fixture tests. |
| Cache | A repeat request changed no cache row (no provider call) and returned the same artwork in 0.4 s |
| Allowlist | @black: `enabled:false`, no artwork |
| Kill switch | OFF: initials everywhere; ON: restored |
| Failure modes (timeout, 401, 429, 503, malformed 200, missing images, mismatches) | Mocked against the exact function code (`tests/classic-profile-consolidated.test.js`). They are not provoked against the live provider. |
