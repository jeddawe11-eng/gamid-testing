// Snapchat. Snap's official web embeds (developers.snap.com/api/snapchat-for-web/social-plugins/embedding-web-content) point at https://www.snapchat.com/<content>/<id>/embed.
// For SPOTLIGHT videos that page is explicitly frameable (frame-ancestors *) and was verified to render and play inside the Wall player sandbox - so Spotlight is a
// portrait (9:16) player; Snap documents a minimum embed width of 326 px. Public PROFILE embeds currently fail (the /embed page answers 500 and denies framing), so
// profiles are an honest card / link. Page CSP needs frame-src https://www.snapchat.com.
import { defineProvider } from "../engine.js";

const USER = "^[A-Za-z0-9._-]{3,15}$";

export const snapchat = defineProvider({
  key: "snapchat",
  label: "Snapchat",
  hosts: ["snapchat.com", "www.snapchat.com"],
  frameOrigins: ["https://www.snapchat.com"],
  examples: "snapchat.com/spotlight/…  ·  snapchat.com/add/name",
  kinds: {
    spotlight: { label: "Spotlight", id: "^[A-Za-z0-9_-]{20,160}$", inline: true, aspect: "9:16", aspects: ["9:16"], size: { width: 440, height: 780 }, minInline: { w: 326, h: 580 }, poster: true },
    profile: { label: "Profile", id: USER, inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] === "spotlight" && parts[1]) return { kind: "spotlight", id: parts[1] };
    // current public share shape (post-Round 2 manual-acceptance finding): snapchat.com/@<username>/spotlight/<id>[?share_id=...&locale=...] - the query is dropped
    if (parts[0]?.startsWith("@") && parts[1] === "spotlight" && parts[2]) return { kind: "spotlight", id: parts[2] };
    if (parts[0] === "add" && parts[1]) return { kind: "profile", id: parts[1] };
    if (parts.length === 1 && parts[0].startsWith("@") && parts[0].length > 1) return { kind: "profile", id: parts[0].slice(1) };
    return null;
  },
  openUrl: (kind, id) => (kind === "spotlight" ? `https://www.snapchat.com/spotlight/${id}` : `https://www.snapchat.com/add/${id}`),
  embedUrl: (kind, id) => (kind === "spotlight" ? `https://www.snapchat.com/spotlight/${id}/embed` : null),
});
