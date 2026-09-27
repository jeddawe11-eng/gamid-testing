// Importing this module registers every supported provider adapter with the Wall core's provider registry (and exposes the engine). A document containing an embed is
// only valid where this module has been imported: the editor, the preview and the persistence checks all import it through the Wall kit.
import "./providers/youtube.js";
import "./providers/tiktok.js";
import "./providers/twitch.js";
import "./providers/spotify.js";
import "./providers/soundcloud.js";
import "./providers/vimeo.js";
import "./providers/kick.js";
import "./providers/facebook.js";
import "./providers/snapchat.js";
import "./providers/x.js";
import "./providers/instagram.js";
import "./providers/discord.js";
import "./providers/steam.js";
import { capabilityMatrix } from "./engine.js";

export * from "./engine.js";

// The Media & Links providers, in the order the editor lists them (Discord invites and Steam stay supported and are listed after them).
export const MEDIA_PROVIDER_ORDER = Object.freeze(["youtube", "tiktok", "twitch", "spotify", "soundcloud", "vimeo", "kick", "facebook", "snapchat", "x", "instagram"]);
export const mediaCapabilities = () => capabilityMatrix(MEDIA_PROVIDER_ORDER);
