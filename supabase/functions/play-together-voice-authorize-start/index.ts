import { handleVoiceAuthorizeStart, readVoiceEnv } from "../_shared/play-together-voice.js";
Deno.serve((request: Request) => handleVoiceAuthorizeStart({ request, env: readVoiceEnv((name: string) => Deno.env.get(name)) }));
