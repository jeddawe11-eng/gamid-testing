// Facebook. Facebook's official Embedded Video Player is a Social Plugin that REQUIRES the Facebook JavaScript SDK (developers.facebook.com/docs/plugins/
// embedded-video-player); the Wall's page policy only runs its own scripts (script-src 'self'), and the bare plugin iframe is documented by Facebook as not working on
// mobile devices and tablets - a Wall is mobile-first. So Facebook videos, Reels and Pages are honest CARDS / LINKS that open on Facebook: no player is offered, no
// frame origin is added, nothing loads from Facebook until a visitor taps. Only a numeric video / Reel id or a Page name is stored; the address is rebuilt from it.
// fb.watch short links cannot be resolved without following a redirect to a third party, so they are not accepted.
import { defineProvider } from "../engine.js";

const RESERVED = new Set(["watch", "reel", "reels", "video.php", "profile.php", "groups", "events", "marketplace", "gaming", "pages", "login", "login.php", "help", "policies", "privacy", "settings", "stories", "photo", "photo.php", "photos", "permalink.php", "story.php", "share", "sharer", "sharer.php", "hashtag", "search", "friends", "messages", "notifications", "bookmarks", "ads", "business", "l.php", "home.php", "plugins", "dialog", "live"]);
const ID = /^[0-9]{5,25}$/;

export const facebook = defineProvider({
  key: "facebook",
  label: "Facebook",
  hosts: ["facebook.com", "www.facebook.com", "m.facebook.com", "web.facebook.com", "fb.com", "www.fb.com", "fb.watch"],
  frameOrigins: [],
  examples: "facebook.com/…/videos/…  ·  facebook.com/reel/…  ·  facebook.com/page",
  kinds: {
    video: { label: "Video", id: "^[0-9]{5,25}$", inline: false, aspect: "auto", size: { width: 800, height: 260 } },
    reel: { label: "Reel", id: "^[0-9]{5,25}$", inline: false, aspect: "auto", size: { width: 800, height: 260 } },
    page: { label: "Page", id: "^[A-Za-z0-9.]{3,50}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    if (url.hostname.toLowerCase() === "fb.watch") return null;
    const parts = url.pathname.split("/").filter(Boolean);
    const v = url.searchParams.get("v");
    if ((parts[0] === "watch" || parts[0] === "video.php") && ID.test(v ?? "")) return { kind: "video", id: v };
    if ((parts[0] === "reel" || parts[0] === "reels") && ID.test(parts[1] ?? "")) return { kind: "reel", id: parts[1] };
    const at = parts.indexOf("videos");
    if (at >= 1) { const id = parts.slice(at + 1).reverse().find(part => ID.test(part)); if (id) return { kind: "video", id }; }
    if (parts.length === 1 && !RESERVED.has(parts[0].toLowerCase())) return { kind: "page", id: parts[0] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "video") return `https://www.facebook.com/watch/?v=${id}`;
    if (kind === "reel") return `https://www.facebook.com/reel/${id}`;
    return `https://www.facebook.com/${id}`;
  },
  embedUrl: () => null,
});
