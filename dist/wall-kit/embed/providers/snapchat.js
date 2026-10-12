// Snapchat. Snap's official web embeds (developers.snap.com/api/snapchat-for-web/social-plugins/embedding-web-content) point at https://www.snapchat.com/<content>/<id>/embed.
// For SPOTLIGHT videos that page is explicitly frameable (frame-ancestors *) and was verified to render and play inside the Wall player sandbox - so Spotlight is a
// portrait (9:16) player; Snap documents a minimum embed width of 326 px. Public PROFILE embeds currently fail (the /embed page answers 500 and denies framing), so
// profiles are an honest card / link. Page CSP needs frame-src https://www.snapchat.com.
import { defineProvider } from "../engine.js";

const USER = "^[A-Za-z0-9._-]{3,15}$";

export const snapchat = defineProvider({
  key: "snapchat",
  label: "Snapchat",
  // the Wall Icon badge (Product Memory DEC-0006): the accepted Classic My Socials badge: its colour and its mark / glyph - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#fffc00", color: "#000000", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12 2.2c3.4 0 5.8 2.6 5.8 6v2.4l1.7-.6c.7-.2 1.2.7.6 1.1l-2.1 1.3c.7 2 2.3 3.4 4.2 3.9.5.1.5.7 0 .9-.9.4-1.8.6-2.6.8-.2.7-.2 1.4-.9 1.4-.8 0-1.7-.4-2.9.3-1.1.7-2.3 1.5-3.8 1.5s-2.7-.8-3.8-1.5c-1.2-.7-2.1-.3-2.9-.3-.7 0-.7-.7-.9-1.4-.8-.2-1.7-.4-2.6-.8-.5-.2-.5-.8 0-.9 1.9-.5 3.5-1.9 4.2-3.9L3.5 11.1c-.6-.4-.1-1.3.6-1.1l1.7.6V8.2c0-3.4 2.4-6 6.2-6z'/%3E%3C/svg%3E\")" }),
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
