// Authentication is performed in the handler (owner JWT or proven backend role).
// jpeg-js (pure JavaScript, pinned) is the trusted decoder / encoder the gateway uses to fully validate and re-encode Classic Profile Banners.
import jpeg from 'npm:jpeg-js@0.4.4';
import { handleUsageUpload } from '../_shared/usage-upload.js';
Deno.serve(request => handleUsageUpload({request,jpeg,log:code=>console.warn(`usage-upload:${code}`),env:{supabaseUrl:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}}));
