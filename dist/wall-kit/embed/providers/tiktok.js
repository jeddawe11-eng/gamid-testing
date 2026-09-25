// TikTok. Official embed page: https://www.tiktok.com/embed/v2/<video id> (verified frameable). Inline for videos; profiles are a link/card. Short links
// (vm.tiktok.com/...) cannot be resolved without following a redirect to a third party, so they are not accepted: paste the full video address.
// Page CSP needs frame-src https://www.tiktok.com. TikTok's player is portrait; W0's "no unusable tiny player" rule applies.
import { defineProvider } from "../engine.js";

export const tiktok = defineProvider({
  key: "tiktok",
  label: "TikTok",
  hosts: ["tiktok.com", "www.tiktok.com", "m.tiktok.com"],
  frameOrigins: ["https://www.tiktok.com"],
  kinds: {
    video: { label: "Video", id: "^[0-9]{8,25}$", inline: true, aspect: "9:16", aspects: ["9:16"], size: { width: 440, height: 780 }, minInline: { w: 250, h: 440 } },
    profile: { label: "Profile", id: "^@[A-Za-z0-9._]{2,24}$", inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0]?.startsWith("@") && parts[1] === "video" && parts[2]) return { kind: "video", id: parts[2] };
    if (parts[0]?.startsWith("@") && parts.length === 1) return { kind: "profile", id: parts[0] };
    return null;
  },
  // A video's stored parts are only its id, so its "open" address is TikTok's own public embed page for it (verified to load); a profile opens normally.
  openUrl: (kind, id) => (kind === "video" ? `https://www.tiktok.com/embed/v2/${id}` : `https://www.tiktok.com/${id}`),
  embedUrl: (kind, id) => (kind === "video" ? `https://www.tiktok.com/embed/v2/${id}` : null),
});
