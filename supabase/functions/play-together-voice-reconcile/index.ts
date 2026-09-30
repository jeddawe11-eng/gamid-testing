import { handleVoiceReconcile, readVoiceEnv } from "../_shared/play-together-voice.js";
Deno.serve((request: Request) => handleVoiceReconcile({ request, env: readVoiceEnv((name: string) => Deno.env.get(name)), log: (event: string, code: string) => console.log(`${event}:${code}`) }));
