// TikTok. Official Embed Player (developers.tiktok.com/doc/embed-player): https://www.tiktok.com/player/v1/<video id> - a plain iframe, no script (verified: renders
// and plays inside the Wall player sandbox; frameable - no X-Frame-Options, no frame-ancestors). The older embed/v2 page is script-driven and stayed black in the
// sandbox (manual-QA finding), so it is no longer used. Videos play inline; profiles are a link/card. Short links (vm.tiktok.com/...) cannot be resolved without
// following a redirect to a third party, so they are not accepted: paste the full video address. TikTok is portrait-first: 9:16 is the default shape, 1:1 and 16:9
// are offered for square / landscape clips (the player letterboxes, never stretches). Page CSP needs frame-src https://www.tiktok.com.
import { defineProvider } from "../engine.js";

export const tiktok = defineProvider({
  key: "tiktok",
  label: "TikTok",
  hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  frameOrigins: ["https://www.tiktok.com"],
  examples: "tiktok.com/@name/video/…  ·  tiktok.com/@name",
  kinds: {
    video: { label: "Video", id: "^[0-9]{8,25}$", inline: true, aspect: "9:16", aspects: ["9:16", "1:1", "16:9"], size: { width: 440, height: 780 }, minInline: { w: 250, h: 444 } },
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
