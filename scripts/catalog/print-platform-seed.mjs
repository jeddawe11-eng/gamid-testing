// Prints the SQL platform seed for the catalog migration from scripts/catalog/platform-map.mjs (the single source of truth).
//   node scripts/catalog/print-platform-seed.mjs
// Only the two stores carry a parent (PC) and only Steam names a discovery provider; every other platform is a plain top-level platform.
import { PLATFORMS } from "./platform-map.mjs";

const STORE_PARENT = { steam: "pc", epic_games: "pc" };
const PROVIDER = { steam: "steam" };
const literal = value => (value === null ? "null" : `'${String(value).replace(/'/g, "''")}'`);

const rows = PLATFORMS.map(platform => `  (${literal(platform.key)}, ${literal(platform.name)}, ${literal(platform.family)}, ${literal(STORE_PARENT[platform.key] ?? null)}, ${literal(PROVIDER[platform.key] ?? null)}, ${platform.sort})`);
console.log(`insert into public.game_platforms (platform_key, display_name, family, parent_platform_key, provider_key, sort_order) values\n${rows.join(",\n")}\non conflict (platform_key) do update set sort_order = excluded.sort_order;`);