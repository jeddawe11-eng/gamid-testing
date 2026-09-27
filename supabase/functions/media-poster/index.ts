// Thin Supabase Edge Function glue: all behavior lives in the tested shared module (supabase/functions/_shared/media-poster.js).
// @ts-nocheck - Deno runtime globals; logic is type-checked as plain JS in the Node test suite.
import { handleMediaPoster } from "../_shared/media-poster.js";

Deno.serve(request =>
  handleMediaPoster({
    request,
    // Codes only - never addresses, ids or image contents.
    log: (event: string, code: string) => console.log(`${event}:${code}`),
  })
);
