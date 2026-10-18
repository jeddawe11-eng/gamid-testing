// Authentication is performed in the handler (owner JWT or proven backend role).
// jpeg-js (pure JavaScript, pinned) is the trusted decoder / encoder the gateway uses to fully validate and re-encode Classic Profile Banners.
// The runtime's own zlib Brotli (font mode) packs uploaded TTF / OTF fonts into WOFF2. It is loaded defensively: if this runtime lacked it, TTF / OTF uploads are
// refused (FONT_CONVERSION_UNAVAILABLE) and everything else keeps working.
import jpeg from 'npm:jpeg-js@0.4.4';
import { handleUsageUpload } from '../_shared/usage-upload.js';
let fontCompress = null, fontDecompress = null;
try {
  const zlib = await import('node:zlib');
  if (typeof zlib.brotliCompressSync === 'function') {
    const { constants } = zlib;
    fontDecompress = (data) => new Uint8Array(zlib.brotliDecompressSync(data));
    fontCompress = (data, quality) => new Uint8Array(zlib.brotliCompressSync(data, { params: { [constants.BROTLI_PARAM_MODE]: constants.BROTLI_MODE_FONT, [constants.BROTLI_PARAM_QUALITY]: quality, [constants.BROTLI_PARAM_SIZE_HINT]: data.length } }));
  }
} catch { fontCompress = null; fontDecompress = null; }
Deno.serve(request => handleUsageUpload({request,jpeg,fontCompress,fontDecompress,log:code=>console.warn(`usage-upload:${code}`),env:{supabaseUrl:Deno.env.get('SUPABASE_URL'),anonKey:Deno.env.get('SUPABASE_ANON_KEY'),serviceKey:Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}}));
