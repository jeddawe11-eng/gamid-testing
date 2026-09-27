// Thin Supabase Edge Function glue: all behavior lives in the tested shared module (supabase/functions/_shared/wall-assets.js).
// @ts-nocheck - Deno runtime globals; logic is type-checked as plain JS in the Node test suite.
import { handleWallAssetRegister, readWallAssetEnv } from "../_shared/wall-assets.js";

Deno.serve(request =>
  handleWallAssetRegister({
    request,
    env: readWallAssetEnv(name => Deno.env.get(name)),
    // Codes only - never tokens, paths, names or file contents.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
