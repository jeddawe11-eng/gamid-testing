// YouTube. Official embed: https://www.youtube-nocookie.com/embed/<id> (the privacy-enhanced host). Inline for videos and playlists; channels are a link/card
// (there is no channel player). Page CSP needs frame-src https://www.youtube-nocookie.com. The player loads only when the visitor taps.
import { defineProvider } from "../engine.js";

const VIDEO = "^[A-Za-z0-9_-]{11}$";
const CHANNEL = "^(@[A-Za-z0-9._-]{3,30}|UC[A-Za-z0-9_-]{22})$";

export const youtube = defineProvider({
  key: "youtube",
  label: "YouTube",
  hosts: ["youtube.com", "www.youtube.com", "m.youtube.com", "music.youtube.com", "youtu.be", "youtube-nocookie.com", "www.youtube-nocookie.com"],
  frameOrigins: ["https://www.youtube-nocookie.com"],
  kinds: {
    // minTile: YouTube's documented smallest thumbnail/tile that may start playback (120 x 70 CSS px) - the Wall's minimum size for a YouTube player element
    video: { label: "Video", id: VIDEO, inline: true, aspect: "16:9", aspects: ["16:9", "9:16", "1:1", "4:3"], size: { width: 800, height: 450 }, minInline: { w: 200, h: 112 }, minTile: { w: 120, h: 70 } },
    playlist: { label: "Playlist", id: "^[A-Za-z0-9_-]{13,64}$", inline: true, aspect: "16:9", aspects: ["16:9", "4:3"], size: { width: 800, height: 450 }, minInline: { w: 200, h: 112 }, minTile: { w: 120, h: 70 } },
    channel: { label: "Channel", id: CHANNEL, inline: false, profile: true, aspect: "auto", size: { width: 800, height: 240 } },
  },
  parse(url) {
    const host = url.hostname.toLowerCase();
    const parts = url.pathname.split("/").filter(Boolean);
    const isVideo = value => new RegExp(VIDEO).test(value ?? "");
    if (host === "youtu.be") return isVideo(parts[0]) ? { kind: "video", id: parts[0] } : null;
    if (parts[0] === "watch" && isVideo(url.searchParams.get("v"))) return { kind: "video", id: url.searchParams.get("v") };
    if (parts[0] === "shorts" && isVideo(parts[1])) return { kind: "video", id: parts[1], aspect: "9:16" };
    if ((parts[0] === "live" || parts[0] === "embed" || parts[0] === "v") && isVideo(parts[1])) return { kind: "video", id: parts[1] };
    if (parts[0] === "playlist" && url.searchParams.get("list")) return { kind: "playlist", id: url.searchParams.get("list") };
    if (parts[0]?.startsWith("@")) return { kind: "channel", id: parts[0] };
    if (parts[0] === "channel" && parts[1]) return { kind: "channel", id: parts[1] };
    return null;
  },
  openUrl(kind, id) {
    if (kind === "video") return `https://www.youtube.com/watch?v=${id}`;
    if (kind === "playlist") return `https://www.youtube.com/playlist?list=${id}`;
    return id.startsWith("@") ? `https://www.youtube.com/${id}` : `https://www.youtube.com/channel/${id}`;
  },
  embedUrl(kind, id) {
    if (kind === "video") return `https://www.youtube-nocookie.com/embed/${id}?rel=0&modestbranding=1&playsinline=1`;
    if (kind === "playlist") return `https://www.youtube-nocookie.com/embed/videoseries?list=${id}&rel=0&playsinline=1`;
    return null;
  },
});
