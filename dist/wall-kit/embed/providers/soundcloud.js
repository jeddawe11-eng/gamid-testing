// SoundCloud. Official widget (developers.soundcloud.com/docs/api/html5-widget): https://w.soundcloud.com/player/?url=<the SoundCloud page address>. The widget takes a
// track, a playlist ("set") or a profile address - all three verified to render and list/play tracks inside the Wall player sandbox (frameable: no X-Frame-Options, no
// frame-ancestors). Only the page PATH is stored (strict lowercase permalink patterns: artist, artist/track, artist/sets/name); the widget address and the page address
// are rebuilt from it. Private tracks (secret s-... links) and short on.soundcloud.com links are not accepted. Page CSP needs frame-src https://w.soundcloud.com.
import { defineProvider } from "../engine.js";

const NAME = "[a-z0-9_-]{2,64}";
const SLUG = "[a-z0-9_-]{1,120}";
const RESERVED = new Set(["discover", "stream", "search", "upload", "you", "pages", "mobile", "charts", "people", "tags", "terms-of-use", "settings", "messages", "notifications", "jobs", "imprint", "popular", "signin", "logout", "feed", "for-artists", "creators", "go", "premium", "home", "download", "apps", "community-guidelines"]);
const PROFILE_TABS = new Set(["tracks", "albums", "sets", "reposts", "likes", "followers", "following", "popular-tracks", "comments", "spotlight"]);
const widget = path => `https://w.soundcloud.com/player/?url=${encodeURIComponent(`https://soundcloud.com/${path}`)}&visual=false&show_comments=false&show_teaser=false`;

export const soundcloud = defineProvider({
  key: "soundcloud",
  label: "SoundCloud",
  hosts: ["soundcloud.com", "www.soundcloud.com", "m.soundcloud.com", "on.soundcloud.com"],
  frameOrigins: ["https://w.soundcloud.com"],
  examples: "soundcloud.com/artist/track  ·  soundcloud.com/artist/sets/…  ·  soundcloud.com/artist",
  kinds: {
    track: { label: "Track", id: `^${NAME}/${SLUG}$`, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 240 }, minInline: { w: 280, h: 166 }, poster: true },
    playlist: { label: "Playlist", id: `^${NAME}/sets/${SLUG}$`, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 620 }, minInline: { w: 280, h: 300 }, poster: true },
    profile: { label: "Profile", id: `^${NAME}$`, inline: true, profile: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 620 }, minInline: { w: 280, h: 300 }, poster: true },
  },
  parse(url) {
    if (url.hostname.toLowerCase() === "on.soundcloud.com") return null;   // a short link: its target cannot be known without following a redirect
    const parts = url.pathname.split("/").filter(Boolean).map(part => part.toLowerCase());
    if (!parts.length || RESERVED.has(parts[0])) return null;
    if (parts.length === 1) return { kind: "profile", id: parts[0] };
    if (parts.length === 2 && PROFILE_TABS.has(parts[1])) return { kind: "profile", id: parts[0] };
    if (parts.length === 3 && parts[1] === "sets") return { kind: "playlist", id: `${parts[0]}/sets/${parts[2]}` };
    if (parts.length === 2) return { kind: "track", id: `${parts[0]}/${parts[1]}` };
    return null;   // secret / private links (artist/track/s-...) and deeper pages are not accepted
  },
  openUrl: (_kind, id) => `https://soundcloud.com/${id}`,
  embedUrl: (_kind, id) => widget(id),
});
