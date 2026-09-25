// Instagram. Instagram's own embed script builds an iframe of https://www.instagram.com/<p|reel>/<shortcode>/embed/ (verified frameable: no X-Frame-Options and no
// frame-ancestors). That public embed page is what is used for posts and Reels; profiles are a link/card (no profile player exists). Limits, stated plainly: private
// or removed posts show Instagram's own "unavailable" page inside the player, the embed's height depends on the caption (so the element is a fixed box), and
// Instagram may change this page at any time - if it stops working the element still opens the post as a card. Page CSP needs frame-src https://www.instagram.com.
import { defineProvider } from "../engine.js";

const CODE = "^[A-Za-z0-9_-]{5,30}$";
const RESERVED = new Set(["p", "reel", "reels", "tv", "explore", "accounts", "stories", "direct", "about", "legal", "web", "developer", "directory", "challenge", "emails", "session", "oauth"]);

export const instagram = defineProvider({
  key: "instagram",
  label: "Instagram",
  hosts: ["instagram.com", "www.instagram.com", "m.instagram.com"],
  frameOrigins: ["https://www.instagram.com"],
  kinds: {
    post: { label: "Post", id: CODE, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 540, height: 700 }, minInline: { w: 326, h: 420 } },
    reel: { label: "Reel", id: CODE, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 540, height: 700 }, minInline: { w: 326, h: 420 } },
    profile: { label: "Profile", id: "^[A-Za-z0-9._]{1,30}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length >= 3 && parts[1] === "p") parts.shift();            // /username/p/<code>
    if (parts.length >= 3 && (parts[1] === "reel" || parts[1] === "reels")) parts.shift();
    if (parts[0] === "p" && parts[1]) return { kind: "post", id: parts[1] };
    if ((parts[0] === "reel" || parts[0] === "reels") && parts[1]) return { kind: "reel", id: parts[1] };
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "profile", id: parts[0] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "post") return `https://www.instagram.com/p/${id}/`;
    if (kind === "reel") return `https://www.instagram.com/reel/${id}/`;
    return `https://www.instagram.com/${id}/`;
  },
  embedUrl(kind, id) {
    if (kind === "post") return `https://www.instagram.com/p/${id}/embed/`;
    if (kind === "reel") return `https://www.instagram.com/reel/${id}/embed/`;
    return null;
  },
});
