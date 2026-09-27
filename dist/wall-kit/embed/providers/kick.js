// Kick. Official channel embed (help.kick.com "How to embed your KICK livestream"): https://player.kick.com/<username> - a plain iframe (verified: renders a live
// channel inside the Wall player sandbox; frameable). Only CHANNELS have a documented embed. VODs (https://kick.com/<channel>/videos/<video id>) are accepted as
// CARDS / LINKS that open on Kick: Kick's player answers a VOD address with "This embed seems to be misconfigured" (verified post-Round 2), so no Player is offered
// for them. Posters come from Kick's public page preview (media-poster): the channel's picture, or the VOD's own thumbnail. The embed is started muted and not
// autoplaying (Kick's own query options); Kick asks that its player UI is not altered, and the Wall never draws over a player. Page CSP needs frame-src
// https://player.kick.com.
import { defineProvider } from "../engine.js";

const RESERVED = new Set(["categories", "category", "browse", "following", "search", "video", "videos", "clips", "clip", "dashboard", "settings", "terms-of-service", "privacy-policy", "community-guidelines", "help", "about", "login", "signup", "subscriptions", "messages", "notifications", "wallet", "creator", "careers", "contact", "dmca", "brand", "legal"]);
const CHANNEL = /^[A-Za-z0-9_-]{3,25}$/;
const VIDEO = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const kick = defineProvider({
  key: "kick",
  label: "Kick",
  hosts: ["kick.com", "www.kick.com", "player.kick.com"],
  frameOrigins: ["https://player.kick.com"],
  examples: "kick.com/name  ·  kick.com/name/videos/…",
  kinds: {
    channel: { label: "Channel", id: "^[A-Za-z0-9_-]{3,25}$", inline: true, profile: true, aspect: "16:9", aspects: ["16:9"], size: { width: 800, height: 450 }, minInline: { w: 320, h: 180 }, poster: true },
    video: { label: "Video", id: "^[A-Za-z0-9_-]{3,25}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", inline: false, aspect: "auto", size: { width: 800, height: 260 }, poster: true, meta: true },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts.length === 3 && parts[1] === "videos" && CHANNEL.test(parts[0]) && !RESERVED.has(parts[0].toLowerCase()) && VIDEO.test(parts[2])) return { kind: "video", id: `${parts[0]}/${parts[2].toLowerCase()}` };
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "channel", id: parts[0] };
    return null;
  },
  openUrl: (kind, id) => (kind === "video" ? `https://kick.com/${id.replace("/", "/videos/")}` : `https://kick.com/${id}`),
  embedUrl: (kind, id) => (kind === "channel" ? `https://player.kick.com/${id}?autoplay=false&muted=true` : null),
});
