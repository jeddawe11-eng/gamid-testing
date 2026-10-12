// TikTok. Official Embed Player (developers.tiktok.com/doc/embed-player): https://www.tiktok.com/player/v1/<video id> - a plain iframe, no script (verified: renders
// and plays inside the Wall player sandbox; frameable - no X-Frame-Options, no frame-ancestors). The older embed/v2 page is script-driven and stayed black in the
// sandbox (manual-QA finding), so it is no longer used. Videos play inline; profiles are a link/card. Short links (vm.tiktok.com/...) cannot be resolved without
// following a redirect to a third party, so they are not accepted: paste the full video address. TikTok is portrait-first: 9:16 is the default shape, 1:1 and 16:9
// are offered for square / landscape clips (the player letterboxes, never stretches). Page CSP needs frame-src https://www.tiktok.com.
import { defineProvider } from "../engine.js";

export const tiktok = defineProvider({
  key: "tiktok",
  label: "TikTok",
  // the Wall Icon badge (Product Memory DEC-0006): the accepted Classic My Socials badge: its colour and its mark / glyph - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#000000", ring: { color: "#25f4ee", width: 0.045 }, color: "#ffffff", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath fill='black' d='M12.525.02c1.31-.02 2.61-.01 3.91-.02.08 1.53.63 3.09 1.75 4.17 1.12 1.11 2.7 1.62 4.24 1.79v4.03c-1.44-.05-2.89-.35-4.2-.97-.57-.26-1.1-.59-1.62-.93-.01 2.92.01 5.84-.02 8.75-.08 1.4-.54 2.79-1.35 3.94-1.31 1.92-3.58 3.17-5.91 3.21-1.43.08-2.86-.31-4.08-1.03-2.02-1.19-3.44-3.37-3.65-5.71-.02-.5-.03-1-.01-1.49.18-1.9 1.12-3.72 2.58-4.96 1.66-1.44 3.98-2.13 6.15-1.72.02 1.48-.04 2.96-.04 4.44-.99-.32-2.15-.23-3.02.37-.63.41-1.11 1.04-1.36 1.75-.21.51-.15 1.07-.14 1.61.24 1.64 1.82 3.02 3.5 2.87 1.12-.01 2.19-.66 2.77-1.61.19-.33.4-.67.41-1.06.1-1.79.06-3.57.07-5.36.01-4.03-.01-8.05.02-12.07z'/%3E%3C/svg%3E\")" }),
  hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  frameOrigins: ["https://www.tiktok.com"],
  examples: "tiktok.com/@name/video/…  ·  tiktok.com/@name",
  kinds: {
    video: { label: "Video", id: "^[0-9]{8,25}$", inline: true, aspect: "9:16", aspects: ["9:16", "1:1", "16:9"], size: { width: 440, height: 780 }, minInline: { w: 250, h: 444 }, poster: true },
    profile: { label: "Profile", id: "^@[A-Za-z0-9._]{2,24}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@") && parts[1] === "video" && parts[2]) return { kind: "video", id: parts[2] };
    if (parts[0] === "player" && parts[1] === "v1" && parts[2]) return { kind: "video", id: parts[2] };
    if (parts[0] === "embed" && parts[1] === "v2" && parts[2]) return { kind: "video", id: parts[2] };
    if (parts[0]?.startsWith("@") && parts.length === 1) return { kind: "profile", id: parts[0] };
    return null;
  },
  // A video's stored part is only its id; TikTok resolves /@/video/<id> to the video's own page (verified), so "open" goes to TikTok itself.
  openUrl: (kind, id) => (kind === "video" ? `https://www.tiktok.com/@/video/${id}` : `https://www.tiktok.com/${id}`),
  embedUrl: (kind, id) => (kind === "video" ? `https://www.tiktok.com/player/v1/${id}?music_info=1&description=1&rel=0` : null),
});
