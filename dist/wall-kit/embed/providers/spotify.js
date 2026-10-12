// Spotify. Official embed: https://open.spotify.com/embed/<type>/<id>. Inline for tracks, albums, playlists, episodes and shows; artists get the embed too, but its
// content is a compact list, so it is offered as a player as well. Page CSP needs frame-src https://open.spotify.com. Spotify sizes its own controls: W0's real-device
// finding was that very small boxes render but crop and compress the player, so each kind has a product minimum that the editor keeps a Player element above (it plays inside that element).
import { defineProvider } from "../engine.js";

const ID = "^[A-Za-z0-9]{22}$";
const compact = { label: "", id: ID, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 240 }, minInline: { w: 280, h: 152 }, poster: true };
const list = { id: ID, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 700 }, minInline: { w: 280, h: 352 }, poster: true };

export const spotify = defineProvider({
  key: "spotify",
  label: "Spotify",
  // the Wall Icon badge (Product Memory DEC-0006): the accepted Classic My Socials badge: its colour and its mark / glyph - tests/wall-icons.test.js keeps it identical to dist/public/public.css
  icon: Object.freeze({ background: "#1db954", color: "#000000", mark: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'%3E%3Cpath d='M4.4 9.1c5.1-1.6 10.5-1.1 15.2 1.5' fill='none' stroke='black' stroke-width='2.4' stroke-linecap='round'/%3E%3Cpath d='M5.6 13c4.2-1.2 8.6-.8 12.4 1.2' fill='none' stroke='black' stroke-width='2' stroke-linecap='round'/%3E%3Cpath d='M6.8 16.6c3.3-.9 6.6-.6 9.5.9' fill='none' stroke='black' stroke-width='1.7' stroke-linecap='round'/%3E%3C/svg%3E\")" }),
  hosts: ["open.spotify.com"],
  frameOrigins: ["https://open.spotify.com"],
  examples: "open.spotify.com/track/…  ·  /album/…  ·  /playlist/…  ·  /episode/…",
  kinds: {
    track: { ...compact, label: "Track" },
    episode: { ...compact, label: "Episode" },
    album: { ...list, label: "Album" },
    playlist: { ...list, label: "Playlist" },
    show: { ...list, label: "Show" },
    artist: { ...list, label: "Artist", profile: true },
  },
  parse(url) {
    const parts = url.pathname.split("/").filter(Boolean);
    if (/^intl-[a-z]{2}(-[a-z]{2})?$/i.test(parts[0] ?? "")) parts.shift();
    if (parts[0] === "embed") parts.shift();
    const [kind, id] = parts;
    return ["track", "episode", "album", "playlist", "show", "artist"].includes(kind) ? { kind, id } : null;
  },
  openUrl: (kind, id) => `https://open.spotify.com/${kind}/${id}`,
  embedUrl: (kind, id) => `https://open.spotify.com/embed/${kind}/${id}?utm_source=generator`,
});
