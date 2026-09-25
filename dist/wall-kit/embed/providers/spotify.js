// Spotify. Official embed: https://open.spotify.com/embed/<type>/<id>. Inline for tracks, albums, playlists, episodes and shows; artists get the embed too, but its
// content is a compact list, so it is offered as a player as well. Page CSP needs frame-src https://open.spotify.com. Spotify sizes its own controls: W0's real-device
// finding was that very small boxes render but crop and compress the player, so each kind has a product minimum below which the element is a tile that opens a larger player.
import { defineProvider } from "../engine.js";

const ID = "^[A-Za-z0-9]{22}$";
const compact = { label: "", id: ID, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 240 }, minInline: { w: 280, h: 152 } };
const list = { id: ID, inline: true, aspect: "auto", aspects: ["auto"], size: { width: 800, height: 700 }, minInline: { w: 280, h: 352 } };

export const spotify = defineProvider({
  key: "spotify",
  label: "Spotify",
  hosts: ["open.spotify.com"],
  frameOrigins: ["https://open.spotify.com"],
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
