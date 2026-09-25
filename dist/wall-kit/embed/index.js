// Importing this module registers every supported provider adapter with the Wall core's provider registry (and exposes the engine). A document containing an embed is
// only valid where this module has been imported: the editor, the preview and the persistence checks all import it through the Wall kit.
import "./providers/youtube.js";
import "./providers/spotify.js";
import "./providers/twitch.js";
import "./providers/tiktok.js";
import "./providers/instagram.js";
import "./providers/x.js";
import "./providers/discord.js";
import "./providers/steam.js";

export * from "./engine.js";
