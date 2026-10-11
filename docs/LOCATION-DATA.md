# Location data (About Me → Location)

Structured Location for the Classic Profile (consolidated update, 2026-10-11). The owner picks a **country**, then optionally a **city of that country**. Nothing is typed freely and nothing is geolocated.

## Source and licence

- **Provider:** [GeoNames](https://www.geonames.org), dump files from `https://download.geonames.org/export/dump/`.
- **Files:**
  - `cities15000.zip` (cities with a population of at least 15,000);
  - `countryInfo.txt`.
- **Download:** 2026-10-11, approved by Mazen.
  - `cities15000.zip`: SHA-256 prefix `9339AC426943C265`, 3,360,949 bytes; extracted `cities15000.txt`: `B62C45B071A37DA4…`, 8,536,948 bytes.
  - `countryInfo.txt`: `C5997EA659DF5BCF…`, 31,680 bytes.
- **Licence:** Creative Commons Attribution 4.0 (CC BY 4.0).
  - Wherever the data is shown, it must be credited to GeoNames. The editor shows "Places: GeoNames (CC BY 4.0)."
  - Any public or production release must keep that attribution. It also needs a credit line in the site's legal / about page.
- **Cost:** none. The data is a one-time import stored in GamID's own database. No runtime API, no per-request cost and no third-party call.

## What is stored

| Table | Contents |
|---|---|
| `public.location_countries` (252 rows) | ISO 3166-1 alpha-2 `country_code` (stable identifier), English `name`, GeoNames id. |
| `public.location_cities` (34,156 rows; 12,364 with an Arabic-script name) | `geoname_id` (stable identifier); `country_code`; `name`; the first Arabic-script alternate name (`name_ar`); a folded `search_key` (English, accent variants and Arabic-script names, max 1,200 characters); `population`. |

- Neither table is readable by clients directly.
- The owner searches cities through `search_location_cities(country, query)`: authenticated, one country, 12 rows, most populous first.
- Countries are delivered with the About Me catalogs. Their Arabic names come from the browser's own `Intl.DisplayNames('ar')` (no dataset).

`profiles.about_country_code` / `about_city_id` hold the owner's choice. A composite foreign key guarantees that the city belongs to the country.

## Search normalization

`dist/account/location.js` `locationSearchKey()` is used by both the import and the editor:
- NFKD, combining marks removed;
- tatweel removed;
- alef forms unified;
- alef maksura → yeh, teh marbuta → heh;
- lower case;
- punctuation → spaces.

## Loading (TESTING)

1. Generate the batch files, outside the repository:
   ```bash
   node scripts/location/geonames-import.mjs --cities <cities15000.txt> --countries <countryInfo.txt> --out <dir>
   ```
   This produces 24 files: `000-countries.sql`, then 1,500 cities per file.
2. Load them in order with `supabase db query --linked -f <file>`. Each file calls `private.import_location_batch(jsonb)`.
   - The import is an idempotent upsert.
   - Only the database owner can run it; it is revoked from every API role.

## Existing free-text Locations

The migration converts nothing.
- A Location typed before this change stays in `profiles.about_location` (the legacy value).
- Visitors still see it while its switch is ON, until the owner chooses a country.
- `get_my_about` returns `location_suggestion` only when the text ends with exactly one country name (the longest wins) and the remaining text is exactly one city of that country. Otherwise it returns nothing.
- Using the suggestion is the owner's own action in the editor, and is saved only with Save Changes.

On TESTING, the only legacy value belongs to @black ("Jeddah Saudi Arabia"). It was not touched.

## Limitations

- Places smaller than 15,000 inhabitants are not in the catalog.
- The catalog does not distinguish two same-named cities of one country (e.g. two Springfields in the US) beyond their population order.
- `name_ar` is the first Arabic-script alternate GeoNames lists, which can be a Persian or Urdu spelling. It is used for search hints, never as the public display (the public text is English).
