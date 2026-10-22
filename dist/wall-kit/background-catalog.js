// The official GamID background catalog for Friends Stages (DEC-0011, Wall Stages V2 2026-10-22). A Friends Stage takes its background ONLY from this catalog -
// never from the owner's own uploads, colours or gradients.
//
// NOT AVAILABLE YET: GamID has not published any official backgrounds, and no catalog files exist, so the catalog is empty and a Friends Stage keeps the plain stage
// colour. Nothing here invents backgrounds, prices or a way to unlock them. When the catalog exists, each entry will be
//   { key, label, tier: "free" | "premium" }
// and a new background kind will let a Friends Stage name one by its key (the document and database rules today refuse ANY background on a Friends Stage).
export const CATALOG_TIERS = Object.freeze(["free", "premium"]);
export const BACKGROUND_CATALOG = Object.freeze([]);

// Which tiers the owner may use. Premium needs a GamID subscription that does not exist, so only Free is eligible for everyone; a future entitlement (decided by the
// server, never in the browser) replaces this.
export const catalogEntitlement = () => Object.freeze({ free: true, premium: false });

// The catalog split by tier, each entry marked eligible or not for this owner.
export function catalogByTier(catalog = BACKGROUND_CATALOG, entitlement = catalogEntitlement()) {
  return Object.fromEntries(CATALOG_TIERS.map(tier => [tier, catalog.filter(entry => entry?.tier === tier).map(entry => ({ ...entry, eligible: entitlement[tier] === true }))]));
}
export const catalogAvailable = (catalog = BACKGROUND_CATALOG) => catalog.length > 0;
