// GamID Discord share card: the square avatar tile the Components V2 card shows as its thumbnail (social-card?handle=<handle>&variant=avatar).
// Plain, dependency-free and Node-testable like _shared/social-card.js; the Deno glue (supabase/functions/social-card/index.ts) renders it with the same
// ImageResponse, the same anonymous identity lookup and the same avatar fetch / WebP conversion as the Identity Card, so the avatar's bytes still only ever
// leave Storage inside social-card. A not-found / unpublished / invalid handle, or an avatar that cannot be read, gets the same letter tile.

export const AVATAR_TILE_SIZE = 256;
const BG = "#1a1030";
const WHITE = "#f7f5ff";

const h = (type, props = {}, children = []) => ({ type, props: { ...props, children: Array.isArray(children) ? children : [children] } });

export const isAvatarVariant = searchParams => searchParams?.get?.("variant") === "avatar";

export function avatarLetter(displayName, handle) {
  const source = (displayName && !String(displayName).trim().startsWith("@") ? displayName : handle) || "";
  return String(source).trim().charAt(0).toUpperCase() || "?";
}

export function buildAvatarTileElement({ displayName, handle, avatarDataUri }) {
  const size = AVATAR_TILE_SIZE;
  if (avatarDataUri) return h("img", { src: avatarDataUri, width: size, height: size, style: { width: size, height: size, objectFit: "cover" } });
  return h("div", { style: {
    width: size, height: size, display: "flex", alignItems: "center", justifyContent: "center",
    background: BG, color: WHITE, fontSize: 128, fontWeight: 800, fontFamily: "Inter",
  } }, avatarLetter(displayName, handle));
}
