// Kick. Official channel embed (help.kick.com "How to embed your KICK livestream"): https://player.kick.com/<username> - a plain iframe (verified: renders a live
// channel inside the Wall player sandbox; frameable). Only CHANNELS have a documented embed; Kick's VOD and clip pages have no documented player, so those addresses are
// not accepted rather than shown as a broken player. The embed is started muted and not autoplaying (Kick's own query options); Kick asks that its player UI is not
// altered, and the Wall never draws over a player. Page CSP needs frame-src https://player.kick.com.
import { defineProvider } from "../engine.js";

const RESERVED = new Set(["categories", "category", "browse", "following", "search", "video", "videos", "clips", "clip", "dashboard", "settings", "terms-of-service", "privacy-policy", "community-guidelines", "help", "about", "login", "signup", "subscriptions", "messages", "notifications", "wallet", "creator", "careers", "contact", "dmca", "brand", "legal"]);

export const kick = defineProvider({
  key: "kick",
  label: "Kick",
  hosts: ["kick.com", "www.kick.com", "player.kick.com"],
  frameOrigins: ["https://player.kick.com"],
  examples: "kick.com/name",
  kinds: {
    channel: { label: "Channel", id: "^[A-Za-z0-9_-]{3,25}$", inline: true, profile: true, aspect: "16:9", aspects: ["16:9"], size: { width: 800, height: 450 }, minInline: { w: 320, h: 180 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "channel", id: parts[0] };
    return null;
  },
  openUrl: (_kind, id) => `https://kick.com/${id}`,
  embedUrl: (_kind, id) => `https://player.kick.com/${id}?autoplay=false&muted=true`,
});
