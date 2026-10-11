// Thin Supabase Edge Function glue: all behavior lives in the tested shared module (supabase/functions/_shared/game-artwork.js).
// @ts-nocheck - Deno runtime globals; logic is checked as plain JS in the Node test suite.
import { handleGameArtwork, readGameArtworkEnv } from "../_shared/game-artwork.js";

Deno.serve(request =>
  handleGameArtwork({
    request,
    env: readGameArtworkEnv(name => Deno.env.get(name)),
    // Codes only - never keys, handles, titles or URLs.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
