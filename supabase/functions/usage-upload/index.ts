// Authentication is performed in the handler (owner JWT or proven backend role).
import { handleUsageUpload } from '../_shared/usage-upload.js';
Deno.serve(request => handleUsageUpload({request,env:{supabaseUrl:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}}));
