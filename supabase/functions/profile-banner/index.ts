// Thin Supabase Edge Function glue: all behavior lives in the tested shared module (supabase/functions/_shared/public-media.js).
// @ts-nocheck - Deno runtime globals; logic is checked as plain JS in the Node test suite.
import { handleProfileBanner, readPublicMediaEnv } from "../_shared/public-media.js";

Deno.serve(request =>
  handleProfileBanner({
    request,
    env: readPublicMediaEnv(name => Deno.env.get(name)),
    // Codes only - never paths, keys, addresses or URLs.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);